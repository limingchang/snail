<template>
  <div class="ai-chat-container">
    <div v-if="!isOpen" class="chat-icon" @click="toggleChat">
      <img src="./icon.gif" alt="Chat Icon" />
    </div>
    <transition name="slide-fade">
      <div v-if="isOpen" class="chat-dialog" :class="{ fullscreen: isFullscreen }">
        <div class="dialog-header">
          <button class="fullscreen-btn" @click="toggleFullscreen">
            <IconFullScreen v-if="!isFullscreen"></IconFullScreen>
            <IconShrinkScreen v-if="isFullscreen"></IconShrinkScreen>
          </button>
          <button class="close-btn" @click="toggleChat">
            <IconError></IconError>
          </button>
        </div>
        <div class="chat-history">
          <div v-for="(item, index) in history" :key="index" @click="loadHistory(index)">
            {{ item.title }}
          </div>
        </div>

        <div class="chat-main">
          <div class="messages">
            <div v-for="(message, index) in messages" :key="index" :class="['message', message.role]">
              {{ message.content }}
            </div>
          </div>
          <div class="input-area">
            <textarea v-model="inputText" @keydown="handleKeyDown" placeholder="输入消息..." />
            <div class="footer">
              <span class="tag">DeepSeek V3</span>
              <button class="send-btn" @click="sendMessage">
              <IconSendFill></IconSendFill>
            </button>
            </div>
            <input type="file" @change="handleFileUpload" ref="fileInput" style="display: none" />
            <button @click="triggerFileInput">上传文件</button>
          </div>
        </div>
      </div>
    </transition>

  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount, nextTick } from 'vue'
import { IconError, IconFullScreen,IconShrinkScreen,IconSendFill } from '../icon'

const isOpen = ref(false)
const isFullscreen = ref(false)
const inputText = ref('')
const messages = ref<any>([])
const history = ref<any>([])
const fileInput = ref(null)
let currentStream = null

const toggleChat = () => {
  isOpen.value = !isOpen.value
}
const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
}

const sendMessage = () => {
  if (!inputText.value.trim()) return

  messages.value.push({
    role: 'user',
    content: inputText.value
  })

  getAIResponse(inputText.value)
  inputText.value = ''
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    console.log('发送消息')
    // event.preventDefault()
    sendMessage()
  }
  if (event.key === 'Enter' && event.shiftKey) {
    console.log('换行')
    event.preventDefault()
    const textarea = event.target as HTMLTextAreaElement
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    inputText.value =
      inputText.value.substring(0, start) +
      '\n' +
      inputText.value.substring(end)
    // 移动光标到新位置
    nextTick(() => {
      textarea.selectionStart = textarea.selectionEnd = start + 1
    })
  }
}

const getAIResponse = (prompt) => {
  // 预留API请求方法
  console.log('发送请求:', prompt)
  simulateStreamResponse()
}

const simulateStreamResponse = () => {
  const responseText = '这是AI的模拟响应...'
  let index = 0

  currentStream = setInterval(() => {
    if (index >= responseText.length) {
      clearInterval(currentStream)
      return
    }

    let aiMessage = messages.value.find(m => m.role === 'ai')
    if (!aiMessage) {
      aiMessage = { role: 'ai', content: '' }
      messages.value.push(aiMessage)
    }

    aiMessage.content += responseText[index++]
  }, 50)
}

const triggerFileInput = () => {
  fileInput.value.click()
}

const handleFileUpload = (event) => {
  const file = event.target.files[0]
  if (!file) return

  console.log('上传文件:', file.name)
  messages.value.push({
    role: 'user',
    content: `[文件] ${file.name}`,
    file
  })
}

const loadHistory = (index) => {
  console.log('加载历史:', index)
}

onBeforeUnmount(() => {
  if (currentStream) {
    clearInterval(currentStream)
  }
})
</script>

<style scoped>
@import './index.scss';
</style>