<script setup lang="ts">
import { computed, ref } from "vue";
import { AliCaptcha } from "@snail-js/vue";
import type {
  AliCaptchaError,
  AliCaptchaExposed,
  AliCaptchaFailPayload,
  AliCaptchaInstance,
  AliCaptchaSuccessPayload,
  CaptchaObj
} from "@snail-js/vue";

/**
 * PNVS（号码认证服务图形验证码）的 loader `ct4.js` 不由本包提供：
 * 它必须由你自己的站点托管，再把 URL 交给 `scriptSrc`。
 * 所以这里留空 —— 两个值都填了才会挂载组件。
 */
const captchaId = ref("");
const scriptSrc = ref("");
const captcha = ref<AliCaptchaExposed | null>(null);
const instance = ref<CaptchaObj | null>(null);
const logs = ref<string[]>([]);

const configured = computed(() => captchaId.value.trim() !== "" && scriptSrc.value.trim() !== "");

function log(line: string): void {
  logs.value = [line, ...logs.value].slice(0, 6);
}

function onReady(value: AliCaptchaInstance): void {
  instance.value = value as CaptchaObj;
  log("ready：拿到 captchaObj，可以调用 showCaptcha() / reset()");
}

function onSuccess(payload: AliCaptchaSuccessPayload): void {
  if (payload.product === "pnvs") {
    log(`success：lot_number = ${payload.result.lot_number}（getValidate() 的结果，交给服务端二次校验）`);
  } else {
    log(`success：${payload.captchaVerifyParam.slice(0, 24)}…`);
  }
}

function onFail(payload: AliCaptchaFailPayload): void {
  log(`fail：${payload.product === "pnvs" ? "用户没通过" : String(payload.result)}`);
}

function onError(error: AliCaptchaError): void {
  log(`error[${error.code}]：${error.message}`);
}
</script>

<template>
  <div class="stack">
    <div class="form">
      <label>captchaId <input v-model="captchaId" placeholder="号码认证服务控制台" /></label>
      <label>
        scriptSrc
        <input v-model="scriptSrc" placeholder="/vendor/aliyun/ct4.js（由你托管）" />
      </label>
    </div>

    <p v-if="!configured" class="hint">
      两个值都填了才会挂载 AliCaptcha；只填 captchaId 会得到
      <code>missing-script-src</code> 错误事件 —— 本包不再内置任何验证码 SDK。
    </p>

    <AliCaptcha
      v-else
      :key="`${captchaId}-${scriptSrc}`"
      ref="captcha"
      product="pnvs"
      :captcha-id="captchaId"
      :script-src="scriptSrc"
      @ready="onReady"
      @success="onSuccess"
      @fail="onFail"
      @error="onError"
      @close="log('close：用户关掉了验证码')"
    />

    <p v-if="configured" class="actions">
      <button type="button" @click="captcha?.show()">show()</button>
      <button type="button" @click="captcha?.reset()">reset()</button>
      <span class="state">instance：{{ instance ? "已就绪" : "尚未创建" }}</span>
    </p>

    <ul class="log">
      <li v-for="(line, index) in logs" :key="index">{{ line }}</li>
    </ul>
  </div>
</template>

<style scoped>
.form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.form label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

input {
  min-width: 200px;
  padding: 3px 6px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}

.actions button {
  padding: 2px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}

.state {
  font-size: 12px;
  color: var(--vp-c-text-2);
}

.log {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--vp-c-text-2);
}
</style>
