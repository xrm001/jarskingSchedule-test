<script setup lang="ts">
import { computed, ref } from 'vue'
import type { User, Visibility } from './types'

defineProps<{ user: User }>()
const emit = defineEmits<{ notify: [message: string] }>()

type ManagementView = 'schedule' | 'rooms' | 'request' | 'mine'
type RequestStatus = 'pending' | 'approved' | 'rejected'
interface MyRequest { id:string; topic:string; date:string; start:string; end:string; room:string; status:RequestStatus }

const view = ref<ManagementView>('schedule')
const selectedDay = ref(3)
const showRoomTimePicker = ref(false)
const roomQuery = ref({ date:'2026-07-03', start:'14:00', end:'15:00' })
const form = ref({ topic:'项目进度沟通', date:'2026-07-03', start:'14:00', end:'15:00', room:'17楼会议室2', visibility:'management' as Visibility, notes:'' })
const requests = ref<MyRequest[]>([
  { id:'m1', topic:'品牌项目阶段汇报', date:'7月3日', start:'13:30', end:'14:30', room:'17楼会议室1', status:'pending' },
  { id:'m2', topic:'季度预算确认', date:'7月4日', start:'10:00', end:'10:30', room:'18楼会议室', status:'approved' },
  { id:'m3', topic:'渠道计划确认', date:'7月2日', start:'14:00', end:'15:00', room:'18楼大会议室', status:'rejected' },
])

const days = [
  { week:'一', day:29 }, { week:'二', day:30 }, { week:'三', day:1 },
  { week:'四', day:2 }, { week:'五', day:3 }, { week:'六', day:4 }, { week:'日', day:5 },
]
const rooms = [
  { name:'17楼大麻展厅', capacity:8, equipment:'电视', available:true },
  { name:'17楼会议室1', capacity:10, equipment:'电视', available:true },
  { name:'17楼会议室2', capacity:4, equipment:'', available:true },
  { name:'17楼香水小展厅', capacity:8, equipment:'电视', available:false },
  { name:'18楼大会议室', capacity:50, equipment:'投影 · 视频', available:false },
  { name:'18楼会议室', capacity:10, equipment:'投影', available:true },
]
const pendingCount = computed(() => requests.value.filter(item => item.status === 'pending').length)
const roomQueryIsPast = computed(() => new Date(`${roomQuery.value.date}T${roomQuery.value.start}:00`).getTime() < Date.now())
const roomQueryOutsideHours = computed(() => roomQuery.value.start < '09:00' || roomQuery.value.end > '18:00' || roomQuery.value.start >= roomQuery.value.end)
const roomQueryUnavailable = computed(() => roomQueryIsPast.value || roomQueryOutsideHours.value)
const titles:Record<ManagementView,string> = { schedule:'石总日程', rooms:'会议室', request:'发起申请', mine:'我的申请' }
const statusLabels:Record<RequestStatus,string> = { pending:'待审批', approved:'已通过', rejected:'已拒绝' }
const visibilityLabels:Record<Visibility,string> = { management:'管理层可见', occupied:'仅显示占用', private:'仅老板和管理员可见' }

function chooseSlot(start:string,end:string) {
  form.value.start = start
  form.value.end = end
  view.value = 'request'
}

function confirmRoomQuery() {
  if (roomQuery.value.start >= roomQuery.value.end) return emit('notify','结束时间必须晚于开始时间')
  if (roomQuery.value.start < '09:00' || roomQuery.value.end > '18:00') return emit('notify','可预约时间为 09:00—18:00')
  showRoomTimePicker.value = false
  emit('notify','已更新会议室可用情况')
}

function submitRequest() {
  if (!form.value.topic.trim()) return emit('notify','请填写会议主题')
  if (form.value.start >= form.value.end) return emit('notify','结束时间必须晚于开始时间')
  if (form.value.start < '09:00' || form.value.end > '18:00') return emit('notify','可预约时间为 09:00—18:00')
  requests.value.unshift({
    id:crypto.randomUUID(), topic:form.value.topic.trim(), date:'7月3日',
    start:form.value.start, end:form.value.end, room:form.value.room, status:'pending',
  })
  emit('notify','预约申请已提交，等待石总审批')
  view.value = 'mine'
}
</script>

<template>
  <header class="top management-top"><div><h1>{{ titles[view] }}</h1></div><button class="avatar">管理层</button></header>
  <div class="content management-content">
    <section v-if="view === 'schedule'" class="management-schedule">
      <div class="boss-state"><div><small>石总当前状态</small><h2><i></i>有空</h2><p>可以提交会议申请</p></div><span>今日 2 项安排</span></div>
      <div class="manager-days"><button v-for="item in days" :key="`${item.week}-${item.day}`" :class="{ active:selectedDay===item.day }" @click="selectedDay=item.day"><span>{{ item.week }}</span><b>{{ item.day }}</b></button></div>
      <div class="section-title"><h2>7月3日 · 可预约时间</h2><span>09:00—18:00</span></div>
      <div class="availability-list">
        <article class="occupied"><time>09:30</time><div><h3>已占用</h3></div></article>
        <article class="free"><time>11:00</time><div><h3>空闲 1小时</h3><p>石总与会议室需审批时再次确认</p></div><button @click="chooseSlot('11:00','12:00')">申请</button></article>
        <article class="free"><time>14:00</time><div><h3>空闲 1小时30分</h3><p>已有待审批申请也可继续提交</p></div><button @click="chooseSlot('14:00','15:00')">申请</button></article>
        <article class="private"><time>16:30</time><div><h3>已占用</h3></div></article>
      </div>
    </section>

    <section v-else-if="view === 'rooms'" class="rooms-page">
      <div class="room-filter"><b>{{ roomQuery.date }} {{ roomQuery.start }}—{{ roomQuery.end }}</b><button @click="showRoomTimePicker=!showRoomTimePicker">切换时间</button></div>
      <div v-if="showRoomTimePicker" class="room-time-picker">
        <label>日期<input v-model="roomQuery.date" type="date"></label>
        <div class="two"><label>开始时间<input v-model="roomQuery.start" type="time" min="09:00" max="18:00"></label><label>结束时间<input v-model="roomQuery.end" type="time" min="09:00" max="18:00"></label></div>
        <small>可查询及预约时段为 09:00—18:00</small>
        <button @click="confirmRoomQuery">查看可用情况</button>
      </div>
      <p v-if="roomQueryIsPast" class="room-warning">所选时段早于当前时间，全部会议室不可选。</p>
      <p v-else-if="roomQueryOutsideHours" class="room-warning">所选时段不在 09:00—18:00 可预约范围内。</p>
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
      <div class="two"><label>开始时间<input v-model="form.start" type="time" min="09:00" max="18:00"></label><label>结束时间<input v-model="form.end" type="time" min="09:00" max="18:00"></label></div>
      <label>会议室<select v-model="form.room"><option v-for="room in rooms.filter(item=>item.available)" :key="room.name">{{ room.name }}</option></select></label>
      <label>可见范围<select v-model="form.visibility"><option value="management">管理层可见</option><option value="occupied">仅显示占用</option><option value="private">仅老板和管理员可见</option></select><small>{{ visibilityLabels[form.visibility] }}</small></label>
      <label>补充说明<textarea v-model="form.notes" rows="3" placeholder="选填"></textarea></label>
      <div class="request-rule">待审批不会锁定时段；石总通过其中一份后，其他重叠申请将自动拒绝。</div>
      <button class="primary" @click="submitRequest">提交预约申请</button>
    </section>

    <section v-else class="mine-page">
      <div class="mine-summary"><span><b>{{ requests.length }}</b>全部申请</span><span><b>{{ pendingCount }}</b>等待审批</span></div>
      <article v-for="item in requests" :key="item.id" class="my-request-card">
        <header><h3>{{ item.topic }}</h3><span :class="item.status">{{ statusLabels[item.status] }}</span></header>
        <p>{{ item.date }} {{ item.start }}—{{ item.end }}</p><p>{{ item.room }}</p>
        <button v-if="item.status==='pending'" @click="item.status='rejected'; emit('notify','申请已取消')">取消申请</button>
        <small v-if="item.status==='rejected'">该时段可能已有其他会议获批，或申请已取消。</small>
      </article>
    </section>
  </div>
  <nav class="management-nav"><button v-for="item in ([['schedule','日程'],['rooms','会议室'],['request','申请'],['mine','我的']] as const)" :key="item[0]" :class="{active:view===item[0]}" @click="view=item[0]"><b>{{ item[0]==='schedule'?'▣':item[0]==='rooms'?'▤':item[0]==='request'?'+':'◷' }}</b>{{ item[1] }}<em v-if="item[0]==='mine'&&pendingCount">{{ pendingCount }}</em></button></nav>
</template>
