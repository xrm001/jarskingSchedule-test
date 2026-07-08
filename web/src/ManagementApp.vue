<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api } from './api'
import type { User, Visibility } from './types'

defineProps<{ user: User }>()
const emit = defineEmits<{ notify: [message: string] }>()

type ManagementView = 'schedule' | 'rooms' | 'request' | 'mine'
type RequestStatus = 'pending' | 'approved' | 'rejected'
interface MyRequest { id:string; topic:string; date:string; start:string; end:string; room:string; status:RequestStatus }
interface ScheduleSlot { start:string; end:string; type:'free'|'occupied'|'personal'; label:string; note?:string }
const BOOKING_START = '09:00'
const BOOKING_END = '19:00'

const view = ref<ManagementView>('schedule')
const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
const selectedDate = ref(today)
const showRoomTimePicker = ref(false)
const roomQuery = ref({ date:today, start:'14:00', end:'15:00' })
const form = ref({ topic:'', date:today, start:'14:00', end:'15:00', roomId:'', visibility:'management' as Visibility, notes:'' })
const requests = ref<MyRequest[]>([])
const bossState = ref({ label:'有空', start:'', end:'', available:true })
const scheduleSlots = ref<ScheduleSlot[]>([])
let statusTimer: ReturnType<typeof setInterval> | null = null
function isSundayIso(value:string) {
  return new Date(`${value}T00:00:00`).getDay() === 0
}

const days = computed(() => {
  const current = new Date(`${today}T00:00:00`)
  const mondayOffset = (current.getDay() + 6) % 7
  const monday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - mondayOffset)
  const weeks = ['一','二','三','四','五','六','日']
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index)
    const iso = toLocalIso(date)
    return { iso, week:weeks[index]!, day:date.getDate(), past:iso < today, sunday:date.getDay() === 0, active:iso === selectedDate.value }
  })
})
const selectedDateLabel = computed(() => {
  const date = new Date(`${selectedDate.value}T00:00:00`)
  return `${date.getMonth()+1}月${date.getDate()}日`
})
const rooms = ref<{ id:string; name:string; capacity:number|null; equipment:string; available:boolean }[]>([])
const pendingCount = computed(() => requests.value.filter(item => item.status === 'pending').length)
const roomQueryIsPast = computed(() => new Date(`${roomQuery.value.date}T${roomQuery.value.start}:00`).getTime() < Date.now())
const roomQueryOutsideHours = computed(() => roomQuery.value.start < BOOKING_START || roomQuery.value.end > BOOKING_END || roomQuery.value.start >= roomQuery.value.end)
const roomQueryUnavailable = computed(() => roomQueryIsPast.value || roomQueryOutsideHours.value)
const titles:Record<ManagementView,string> = { schedule:'石总日程', rooms:'会议室', request:'发起约谈', mine:'我的申请' }
const statusLabels:Record<RequestStatus,string> = { pending:'待审批', approved:'已通过', rejected:'已拒绝' }
const visibilityLabels:Record<Visibility,string> = { management:'全员可见', occupied:'对外显示为已占用', private:'仅石总可见（对外显示为已占用）' }

function chooseSlot(start:string,end:string) {
  form.value.date = selectedDate.value
  form.value.start = start
  form.value.end = end
  view.value = 'request'
}

function toLocalIso(date:Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

async function selectScheduleDate(iso:string) {
  if (iso < today) return
  if (isSundayIso(iso)) return emit('notify','周日为休息日，不可预约')
  selectedDate.value = iso
  if (iso === today) {
    scheduleSlots.value = buildSlots(await api.getCurrentBossSchedule(today))
    return
  }
  scheduleSlots.value = buildSlots([])
}

async function loadRoomAvailability() {
  rooms.value = (await api.getMeetingRoomAvailability(roomQuery.value.date,roomQuery.value.start,roomQuery.value.end)).map(room => ({
    id:room.id,name:room.name,capacity:room.capacity,equipment:room.equipment||'',available:room.available,
  }))
}

async function confirmRoomQuery() {
  if (roomQuery.value.start >= roomQuery.value.end) return emit('notify','结束时间必须晚于开始时间')
  if (roomQuery.value.start < BOOKING_START || roomQuery.value.end > BOOKING_END) return emit('notify','可预约时间为 09:00—19:00')
  try { await loadRoomAvailability(); showRoomTimePicker.value = false; emit('notify','已更新会议室可用情况') }
  catch { emit('notify','会议室可用情况查询失败') }
}

async function submitRequest() {
  if (!form.value.topic.trim()) return emit('notify','请填写会议主题')
  if (isSundayIso(form.value.date)) return emit('notify','周日为休息日，不可预约')
  if (form.value.start >= form.value.end) return emit('notify','结束时间必须晚于开始时间')
  if (form.value.start < BOOKING_START || form.value.end > BOOKING_END) return emit('notify','可预约时间为 09:00—19:00')
  if (!form.value.roomId) return emit('notify','请选择会议室')
  try {
    await api.createMeetingRequest({
      topic:form.value.topic.trim(), roomId:form.value.roomId,
      startAt:`${form.value.date}T${form.value.start}:00+08:00`,
      endAt:`${form.value.date}T${form.value.end}:00+08:00`,
      visibility:form.value.visibility, meetingContent:form.value.notes,
    })
    await loadMyRequests()
    emit('notify','预约申请已提交，等待石总审批')
    view.value = 'mine'
  } catch { emit('notify','提交失败，请检查时段和会议室') }
}

const formatTime = (value:string) => new Date(value).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})
const formatDate = (value:string) => new Date(value).toLocaleDateString('zh-CN',{month:'long',day:'numeric'})

async function loadMyRequests() {
  requests.value = (await api.getMyRequests()).map(item => ({
    id:item.id,topic:item.topic,date:formatDate(item.startAt),start:formatTime(item.startAt),end:formatTime(item.endAt),
    room:item.room || '未选择会议室',status:item.status === 'cancelled' ? 'rejected' : item.status,
  }))
}

function buildSlots(entries: Awaited<ReturnType<typeof api.getCurrentBossSchedule>>):ScheduleSlot[] {
  if (isSundayIso(selectedDate.value)) return [{start:BOOKING_START,end:BOOKING_END,type:'occupied',label:'周日休息',note:'周日默认不可预约'}]
  const blocks = entries.map(entry => ({start:formatTime(entry.startAt),end:formatTime(entry.endAt),type:entry.sourceType === 'PERSONAL' ? 'personal' as const : 'occupied' as const,label:entry.title})).sort((a,b)=>a.start.localeCompare(b.start))
  const result:ScheduleSlot[]=[]
  let cursor=BOOKING_START
  for(const block of blocks){
    const start=block.start<BOOKING_START?BOOKING_START:block.start
    const end=block.end>BOOKING_END?BOOKING_END:block.end
    if(start>cursor) result.push({start:cursor,end:start,type:'free',label:'空闲',note:'可申请与石总约谈'})
    if(end>cursor && start<BOOKING_END) result.push({start,end,type:block.type,label:block.type==='personal'?'个人行程':'已占用'})
    if(end>cursor) cursor=end
  }
  if(cursor<BOOKING_END) result.push({start:cursor,end:BOOKING_END,type:'free',label:'空闲',note:'可申请与石总约谈'})
  return result
}

async function cancelRequest(item:MyRequest) {
  try { await api.cancelMeetingRequest(item.id); await loadMyRequests(); emit('notify','申请已取消') }
  catch { emit('notify','该申请已处理，无法取消') }
}

async function refreshBossState() {
  const status = await api.getCurrentBossStatus()
  bossState.value = {label:status.label,start:status.start||'',end:status.end||'',available:status.available}
}

onMounted(async () => {
  try {
    const [roomRows,myRows,status,entries] = await Promise.all([api.getMeetingRoomAvailability(roomQuery.value.date,roomQuery.value.start,roomQuery.value.end),api.getMyRequests(),api.getCurrentBossStatus(),api.getCurrentBossSchedule(today)])
    rooms.value = roomRows.map(room => ({ id:room.id,name:room.name,capacity:room.capacity,equipment:room.equipment||'',available:room.available }))
    const firstAvailable=rooms.value.find(room=>room.available)
    if (firstAvailable) form.value.roomId = firstAvailable.id
    requests.value = myRows.map(item => ({id:item.id,topic:item.topic,date:formatDate(item.startAt),start:formatTime(item.startAt),end:formatTime(item.endAt),room:item.room||'未选择会议室',status:item.status==='cancelled'?'rejected':item.status}))
    bossState.value = {label:status.label,start:status.start||'',end:status.end||'',available:status.available}
    scheduleSlots.value = buildSlots(entries)
    statusTimer = setInterval(() => { void refreshBossState() }, 30_000)
  } catch { emit('notify', '会议室加载失败，请稍后重试') }
})

onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer)
})
</script>

<template>
  <header class="top management-top"><div><h1>{{ titles[view] }}</h1></div><button class="avatar">员工</button></header>
  <div class="content management-content">
    <section v-if="view === 'schedule'" class="management-schedule">
      <div class="boss-state"><div><small>石总当前状态</small><h2><i :class="{ busy:!bossState.available }"></i>{{ bossState.label }}</h2><p v-if="bossState.start && bossState.end">{{ bossState.start }}—{{ bossState.end }}</p><p v-else>{{ bossState.available ? '可以提交约谈申请' : '当前状态未设置时段' }}</p></div><span>今日 3 项安排</span></div>
      <div class="manager-days"><button v-for="item in days" :key="item.iso" :disabled="item.past || item.sunday" :class="{ active:item.active, past:item.past || item.sunday }" @click="selectScheduleDate(item.iso)"><span>{{ item.week }}</span><b>{{ item.day }}</b></button></div>
      <div class="section-title"><h2>{{ selectedDateLabel }} · 可预约时间</h2><span>09:00—19:00</span></div>
      <div class="availability-list">
        <article v-for="slot in scheduleSlots" :key="`${slot.start}-${slot.end}`" :class="slot.type">
          <time>{{ slot.start }}<small>{{ slot.end }}</small></time>
          <div><h3>{{ slot.label }}</h3><p v-if="slot.note">{{ slot.note }}</p></div>
          <button v-if="slot.type==='free'" @click="chooseSlot(slot.start,slot.end)">申请</button>
        </article>
      </div>
    </section>

    <section v-else-if="view === 'rooms'" class="rooms-page">
      <div class="room-filter"><b>{{ roomQuery.date }} {{ roomQuery.start }}—{{ roomQuery.end }}</b><button @click="showRoomTimePicker=!showRoomTimePicker">切换时间</button></div>
      <div v-if="showRoomTimePicker" class="room-time-picker">
        <label>日期<input v-model="roomQuery.date" type="date"></label>
        <div class="two"><label>开始时间<input v-model="roomQuery.start" type="time" min="09:00" max="19:00"></label><label>结束时间<input v-model="roomQuery.end" type="time" min="09:00" max="19:00"></label></div>
        <small>可查询及预约时段为 09:00—19:00</small>
        <button @click="confirmRoomQuery">查看可用情况</button>
      </div>
      <p v-if="roomQueryIsPast" class="room-warning">所选时段早于当前时间，全部会议室不可选。</p>
      <p v-else-if="roomQueryOutsideHours" class="room-warning">所选时段不在 09:00—19:00 可预约范围内。</p>
      <p v-else class="page-hint">查看所选时段的会议室可用情况；最终状态将在石总审批时再次校验。</p>
      <article v-for="room in rooms" :key="room.name" class="room-card" :class="{ unavailable:roomQueryUnavailable || !room.available }">
        <div><h3>{{ room.name }}</h3><p>{{ room.capacity }}人 <template v-if="room.equipment">· {{ room.equipment }}</template></p></div>
        <span>{{ roomQueryUnavailable ? '不可选' : room.available ? '可用' : '已占用' }}</span>
      </article>
    </section>

    <section v-else-if="view === 'request'" class="request-page">
      <div class="request-intro"><span>预约对象</span><strong>石总</strong><small>提交后由石总本人审批</small></div>
      <label>会议主题<input v-model="form.topic" placeholder="请输入会议主题"></label>
      <label>日期<input v-model="form.date" type="date"></label>
      <div class="two"><label>开始时间<input v-model="form.start" type="time" min="09:00" max="19:00"></label><label>结束时间<input v-model="form.end" type="time" min="09:00" max="19:00"></label></div>
      <label>会议室<select v-model="form.roomId"><option v-for="room in rooms.filter(item=>item.available)" :key="room.id" :value="room.id">{{ room.name }}</option></select></label>
      <label>可见范围<select v-model="form.visibility"><option value="management">全员可见</option><option value="private">仅石总可见（对外显示为已占用）</option></select><small>{{ visibilityLabels[form.visibility] }}</small></label>
      <label>会议内容（选填）<textarea v-model="form.notes" rows="3" placeholder="请输入需要沟通的内容"></textarea></label>
      <div class="request-rule">待审批不会锁定时段；石总通过其中一份后，其他重叠申请将自动拒绝。</div>
      <button class="primary" @click="submitRequest">提交预约申请</button>
    </section>

    <section v-else class="mine-page">
      <div class="mine-summary"><span><b>{{ requests.length }}</b>全部申请</span><span><b>{{ pendingCount }}</b>等待审批</span></div>
      <article v-for="item in requests" :key="item.id" class="my-request-card">
        <header><h3>{{ item.topic }}</h3><span :class="item.status">{{ statusLabels[item.status] }}</span></header>
        <p>{{ item.date }} {{ item.start }}—{{ item.end }}</p><p>{{ item.room }}</p>
        <button v-if="item.status==='pending'" @click="cancelRequest(item)">取消申请</button>
        <small v-if="item.status==='rejected'">该时段可能已有其他会议获批，或申请已取消。</small>
      </article>
    </section>
  </div>
  <nav class="management-nav"><button v-for="item in ([['schedule','日程'],['rooms','会议室'],['request','申请'],['mine','我的']] as const)" :key="item[0]" :class="{active:view===item[0]}" @click="view=item[0]"><b>{{ item[0]==='schedule'?'▣':item[0]==='rooms'?'▤':item[0]==='request'?'+':'◷' }}</b>{{ item[1] }}<em v-if="item[0]==='mine'&&pendingCount">{{ pendingCount }}</em></button></nav>
</template>
