<script setup lang="ts">
import { computed, ref } from "vue";
import { AliCaptcha } from "@snail-js/vue";
import type {
  AliCaptchaError,
  AliCaptchaExposed,
  AliCaptchaFailPayload,
  AliCaptchaInstance,
  AliCaptchaSuccessPayload,
  Captcha2Instance
} from "@snail-js/vue";

/**
 * 验证码 2.0 需要控制台签发的 SceneId（场景）与 prefix（身份标）才能初始化，
 * 所以这里故意留空：没有真实凭据时挂载组件只会让 SDK 报错，那不是示例要演示的东西。
 */
const sceneId = ref("");
const prefix = ref("");
const region = ref<"cn" | "sgp">("cn");
const mode = ref<"popup" | "embed">("popup");

const captcha = ref<AliCaptchaExposed | null>(null);
const instance = ref<Captcha2Instance | null>(null);
const logs = ref<string[]>([]);

const configured = computed(() => sceneId.value.trim() !== "" && prefix.value.trim() !== "");

function log(line: string): void {
  logs.value = [line, ...logs.value].slice(0, 6);
}

function onReady(value: AliCaptchaInstance): void {
  instance.value = value as Captcha2Instance;
  log("ready：实例存在了，show() / hide() / refresh() 从这一刻起可用");
}

function onSuccess(payload: AliCaptchaSuccessPayload): void {
  if (payload.product === "captcha2") {
    log(`success：captchaVerifyParam = ${payload.captchaVerifyParam.slice(0, 24)}…（要交给服务端校验）`);
  } else {
    log(`success：lot_number = ${payload.result.lot_number}`);
  }
}

function onFail(payload: AliCaptchaFailPayload): void {
  log(`fail：${payload.product === "captcha2" ? String(payload.result) : "用户没通过"}`);
}

function onError(error: AliCaptchaError): void {
  log(`error[${error.code}]：${error.message}`);
}
</script>

<template>
  <div class="stack">
    <div class="form">
      <label>SceneId <input v-model="sceneId" placeholder="验证码 2.0 控制台" /></label>
      <label>prefix（身份标） <input v-model="prefix" placeholder="不是资源路径" /></label>
      <label>
        region
        <select v-model="region">
          <option value="cn">cn</option>
          <option value="sgp">sgp</option>
        </select>
      </label>
      <label>
        mode
        <select v-model="mode">
          <option value="popup">popup</option>
          <option value="embed">embed</option>
        </select>
      </label>
    </div>

    <p v-if="!configured" class="hint">
      填上 SceneId 与 prefix 之后才会挂载 AliCaptcha，脚本也才会从阿里云 CDN 加载。
    </p>

    <!-- props 只在挂载时读一次：换 scene 要用 :key 重新挂载，否则 SDK 不会重新初始化 -->
    <AliCaptcha
      v-else
      :key="`${sceneId}-${prefix}`"
      ref="captcha"
      product="captcha2"
      :scene-id="sceneId"
      :prefix="prefix"
      :region="region"
      :mode="mode"
      trigger-label="点击验证"
      @ready="onReady"
      @success="onSuccess"
      @fail="onFail"
      @error="onError"
      @close="log('close：用户关掉了弹层')"
    />

    <p v-if="configured" class="actions">
      <button type="button" @click="captcha?.show()">show()</button>
      <button type="button" @click="captcha?.hide()">hide()</button>
      <button type="button" @click="captcha?.refresh()">refresh()</button>
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

input,
select {
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
