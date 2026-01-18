<script setup lang="ts">
import { ref, computed } from 'vue'

const capacity = ref(5)
const buffer = ref<(number | null)[]>([null, null, null, null, null])
const sendx = ref(0)
const recvx = ref(0)
const qcount = ref(0)
const closed = ref(false)
const nextValue = ref(1)

const sendq = ref<number[]>([])
const recvq = ref<number[]>([])

const isFull = computed(() => qcount.value >= capacity.value)
const isEmpty = computed(() => qcount.value === 0)

function send() {
  if (closed.value) {
    alert('panic: send on closed channel')
    return
  }

  if (recvq.value.length > 0) {
    // Direct send to waiting receiver
    recvq.value.shift()
    nextValue.value++
    return
  }

  if (!isFull.value) {
    // Add to buffer
    buffer.value[sendx.value] = nextValue.value
    sendx.value = (sendx.value + 1) % capacity.value
    qcount.value++
    nextValue.value++
  } else {
    // Block (add to sendq)
    sendq.value.push(nextValue.value)
    nextValue.value++
  }
}

function receive() {
  if (closed.value && isEmpty.value) {
    alert('Received zero value (channel closed)')
    return
  }

  if (sendq.value.length > 0 && isFull.value) {
    // Take from buffer, sender writes to freed slot
    buffer.value[recvx.value] = sendq.value.shift()!
    recvx.value = (recvx.value + 1) % capacity.value
    // qcount stays the same
    return
  }

  if (!isEmpty.value) {
    // Take from buffer
    buffer.value[recvx.value] = null
    recvx.value = (recvx.value + 1) % capacity.value
    qcount.value--

    // If there's a blocked sender, let it send
    if (sendq.value.length > 0) {
      const val = sendq.value.shift()!
      buffer.value[sendx.value] = val
      sendx.value = (sendx.value + 1) % capacity.value
      qcount.value++
    }
  } else {
    // Block (add to recvq)
    recvq.value.push(1)
  }
}

function closeChannel() {
  if (closed.value) {
    alert('panic: close of closed channel')
    return
  }
  closed.value = true
  // Wake up all receivers with zero values
  recvq.value = []
  // Senders would panic - clear for demo
  sendq.value = []
}

function reset() {
  buffer.value = Array(capacity.value).fill(null)
  sendx.value = 0
  recvx.value = 0
  qcount.value = 0
  closed.value = false
  nextValue.value = 1
  sendq.value = []
  recvq.value = []
}
</script>

<template>
  <div class="channel-viz">
    <div class="viz-header">
      <h3>Channel Internals Visualizer</h3>
      <div class="controls">
        <button class="btn btn-send" @click="send" :disabled="closed">Send</button>
        <button class="btn btn-receive" @click="receive">Receive</button>
        <button class="btn btn-close" @click="closeChannel" :disabled="closed">Close</button>
        <button class="btn btn-reset" @click="reset">Reset</button>
      </div>
    </div>

    <div class="hchan-container">
      <!-- hchan struct visualization -->
      <div class="hchan-struct">
        <div class="struct-title">hchan</div>
        <div class="struct-fields">
          <div class="field">
            <span class="field-name">qcount</span>
            <span class="field-value">{{ qcount }}</span>
          </div>
          <div class="field">
            <span class="field-name">dataqsiz</span>
            <span class="field-value">{{ capacity }}</span>
          </div>
          <div class="field">
            <span class="field-name">sendx</span>
            <span class="field-value">{{ sendx }}</span>
          </div>
          <div class="field">
            <span class="field-name">recvx</span>
            <span class="field-value">{{ recvx }}</span>
          </div>
          <div class="field">
            <span class="field-name">closed</span>
            <span class="field-value" :class="{ 'text-red': closed }">{{ closed ? 1 : 0 }}</span>
          </div>
        </div>
      </div>

      <!-- Ring Buffer -->
      <div class="ring-buffer-container">
        <div class="buffer-title">Ring Buffer (buf)</div>
        <div class="ring-buffer">
          <div
            v-for="(val, idx) in buffer"
            :key="idx"
            class="buffer-slot"
            :class="{
              'has-value': val !== null,
              'is-sendx': idx === sendx,
              'is-recvx': idx === recvx,
              'is-both': idx === sendx && idx === recvx
            }"
          >
            <div class="slot-index">{{ idx }}</div>
            <div class="slot-value">{{ val ?? '-' }}</div>
            <div class="slot-markers">
              <span v-if="idx === sendx" class="marker marker-send">S</span>
              <span v-if="idx === recvx" class="marker marker-recv">R</span>
            </div>
          </div>
        </div>
        <div class="buffer-legend">
          <span class="legend-item"><span class="marker marker-send">S</span> sendx</span>
          <span class="legend-item"><span class="marker marker-recv">R</span> recvx</span>
        </div>
      </div>

      <!-- Wait queues -->
      <div class="wait-queues">
        <div class="waitq">
          <div class="waitq-title">sendq (blocked senders)</div>
          <div class="waitq-list">
            <div v-for="(val, idx) in sendq" :key="idx" class="waiter waiter-send">
              G{{ idx + 1 }}: {{ val }}
            </div>
            <div v-if="sendq.length === 0" class="waitq-empty">empty</div>
          </div>
        </div>
        <div class="waitq">
          <div class="waitq-title">recvq (blocked receivers)</div>
          <div class="waitq-list">
            <div v-for="(_, idx) in recvq" :key="idx" class="waiter waiter-recv">
              G{{ idx + 1 }}
            </div>
            <div v-if="recvq.length === 0" class="waitq-empty">empty</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Status -->
    <div class="status-bar">
      <div class="status-item" :class="{ active: isEmpty && !closed }">Empty</div>
      <div class="status-item" :class="{ active: isFull }">Full</div>
      <div class="status-item" :class="{ active: closed }">Closed</div>
      <div class="status-item" :class="{ active: sendq.length > 0 }">Senders blocked</div>
      <div class="status-item" :class="{ active: recvq.length > 0 }">Receivers blocked</div>
    </div>
  </div>
</template>

<style scoped>
.channel-viz {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.viz-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.viz-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-send {
  background: #4ade80;
  color: #0a0a0a;
}

.btn-send:hover:not(:disabled) {
  background: #22c55e;
}

.btn-receive {
  background: #60a5fa;
  color: #0a0a0a;
}

.btn-receive:hover:not(:disabled) {
  background: #3b82f6;
}

.btn-close {
  background: #f87171;
  color: #0a0a0a;
}

.btn-close:hover:not(:disabled) {
  background: #ef4444;
}

.btn-reset {
  background: #3a3a5e;
  color: #e0e0e0;
  border: 1px solid #4a4a7e;
}

.btn-reset:hover {
  background: #4a4a7e;
}

.hchan-container {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.hchan-struct {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
  min-width: 150px;
}

.struct-title {
  font-size: 14px;
  font-weight: 600;
  color: #4ecdc4;
  margin-bottom: 12px;
}

.struct-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.field-name {
  color: #808080;
}

.field-value {
  color: #e0e0e0;
  font-weight: 600;
}

.text-red {
  color: #f87171;
}

.ring-buffer-container {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
}

.buffer-title {
  font-size: 12px;
  color: #808080;
  margin-bottom: 12px;
}

.ring-buffer {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.buffer-slot {
  width: 60px;
  height: 70px;
  background: #1a1a2e;
  border: 2px solid #3a3a5e;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.2s ease;
}

.buffer-slot.has-value {
  background: #2a3a2a;
  border-color: #4ade80;
}

.buffer-slot.is-sendx {
  border-color: #fbbf24;
}

.buffer-slot.is-recvx {
  border-color: #60a5fa;
}

.buffer-slot.is-both {
  border-color: #a78bfa;
}

.slot-index {
  font-size: 10px;
  color: #606080;
  position: absolute;
  top: 4px;
  left: 6px;
}

.slot-value {
  font-size: 18px;
  font-weight: 600;
  color: #e0e0e0;
}

.slot-markers {
  position: absolute;
  bottom: 4px;
  display: flex;
  gap: 4px;
}

.marker {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 2px;
}

.marker-send {
  background: #fbbf24;
  color: #0a0a0a;
}

.marker-recv {
  background: #60a5fa;
  color: #0a0a0a;
}

.buffer-legend {
  margin-top: 12px;
  display: flex;
  gap: 16px;
  font-size: 11px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #808080;
}

.wait-queues {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.waitq {
  background: #252545;
  border-radius: 6px;
  padding: 12px;
}

.waitq-title {
  font-size: 11px;
  color: #808080;
  margin-bottom: 8px;
}

.waitq-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.waiter {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.waiter-send {
  background: #3a3a1a;
  border: 1px solid #fbbf24;
  color: #fbbf24;
}

.waiter-recv {
  background: #1a2a3a;
  border: 1px solid #60a5fa;
  color: #60a5fa;
}

.waitq-empty {
  color: #606080;
  font-size: 11px;
  font-style: italic;
}

.status-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 16px;
  border-top: 1px solid #2a2a4e;
}

.status-item {
  padding: 4px 10px;
  background: #252545;
  border-radius: 4px;
  font-size: 11px;
  color: #606080;
  transition: all 0.2s ease;
}

.status-item.active {
  background: #3a3a5e;
  color: #e0e0e0;
}

@media (max-width: 600px) {
  .hchan-container {
    grid-template-columns: 1fr;
  }

  .wait-queues {
    grid-template-columns: 1fr;
  }

  .buffer-slot {
    width: 50px;
    height: 60px;
  }
}
</style>
