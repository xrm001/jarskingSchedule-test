<script setup lang="ts">
import { computed, ref } from 'vue'
import type { User } from './types'

defineProps<{ user: User }>()
const emit = defineEmits<{ notify: [message: string] }>()

type AdminView = 'overview' | 'members' | 'rooms' | 'system'
type MemberRole = 'BOSS' | 'MANAGEMENT' | 'ADMIN' | 'NONE'

const view = ref<AdminView>('overview')
const memberKeyword = ref('')
const recordFilter = ref<'all' | 'pending' | 'approved' | 'rejected'>('all')
const titles: Record<AdminView, string> = { overview:'管理概览', members:'成员权限', rooms:'会议室资源', system:'系统管理' }
const roleLabels: Record<MemberRole, string> = { BOSS:'老板', MANAGEMENT:'管理层', ADMIN:'管理员', NONE:'无权限' }

const members = ref([
  { id:'u1', name:'石总', department:'总经办', role:'BOSS' as MemberRole, synced:true },
  { id:'u2', name:'陈经理', department:'经营管理部', role:'MANAGEMENT' as MemberRole, synced:true },
  { id:'u3', name:'林总监', department:'品牌中心', role:'MANAGEMENT' as MemberRole, synced:true },
  { id:'u4', name:'子墨', department:'信息管理部', role:'ADMIN' as MemberRole, synced:true },
  { id:'u5', name:'周主管', department:'销售部', role:'NONE' as MemberRole, synced:true },
])

const rooms = ref([
  { id:'r1', name:'17楼大麻展厅', capacity:8, equipment:'电视', enabled:true },
  { id:'r2', name:'17楼会议室1', capacity:10, equipment:'电视', enabled:true },
  { id:'r3', name:'17楼会议室2', capacity:4, equipment:'无', enabled:true },
  { id:'r4', name:'17楼香水小展厅', capacity:8, equipment:'电视', enabled:true },
  { id:'r5', name:'18楼大会议室', capacity:50, equipment:'投影、视频', enabled:true },
  { id:'r6', name:'18楼会议室', capacity:10, equipment:'投影', enabled:true },
])

const records = ref([
  { id:'a1', applicant:'陈经理', topic:'项目进度沟通', time:'7月3日 14:00—15:00', room:'17楼会议室2', status:'pending' },
  { id:'a2', applicant:'林总监', topic:'品牌项目阶段汇报', time:'7月3日 13:30—14:30', room:'17楼会议室1', status:'pending' },
  { id:'a3', applicant:'陈经理', topic:'季度预算确认', time:'7月4日 10:00—10:30', room:'18楼会议室', status:'approved' },
  { id:'a4', applicant:'周主管', topic:'渠道计划确认', time:'7月2日 14:00—15:00', room:'18楼大会议室', status:'rejected' },
])

const integrations = ref([
  { id:'wecom', name:'企业微信身份', detail:'OAuth 与通讯录角色同步', state:'待配置', ready:false },
  { id:'message', name:'企微应用消息', detail:'审批、摘要及会前提醒', state:'待配置', ready:false },
  { id:'asr', name:'腾讯云语音识别', detail:'国内与海外实时语音线路', state:'待配置', ready:false },
  { id:'ai', name:'DeepSeek 语义解析', detail:'将识别文本转换为状态与行程', state:'待配置', ready:false },
])

const filteredMembers = computed(() => {
  const keyword = memberKeyword.value.trim().toLowerCase()
  return keyword ? members.value.filter(item => `${item.name}${item.department}`.toLowerCase().includes(keyword)) : members.value
})
const filteredRecords = computed(() => recordFilter.value === 'all' ? records.value : records.value.filter(item => item.status === recordFilter.value))
const managerCount = computed(() => members.value.filter(item => item.role === 'MANAGEMENT').length)
const enabledRoomCount = computed(() => rooms.value.filter(item => item.enabled).length)
const pendingCount = computed(() => records.value.filter(item => item.status === 'pending').length)

function saveRole(member: typeof members.value[number], previousRole: MemberRole) {
  if (previousRole === 'BOSS' && member.role !== 'BOSS') {
    member.role = previousRole
    return emit('notify','老板角色不可在此直接移除，请先完成老板身份交接')
  }
  if (member.role === 'BOSS' && members.value.some(item => item.id !== member.id && item.role === 'BOSS')) {
    member.role = previousRole
    return emit('notify','系统仅允许设置一位老板')
  }
  emit('notify',`${member.name}的角色已更新为${roleLabels[member.role]}`)
}

function toggleRoom(room: typeof rooms.value[number]) {
  room.enabled = !room.enabled
  emit('notify',`${room.name}已${room.enabled ? '启用' : '停用'}`)
}

function testIntegration(item: typeof integrations.value[number]) {
  item.ready = true
  item.state = '测试通过'
  emit('notify',`${item.name}连接测试通过（演示状态）`)
}
</script>

<template>
  <header class="top admin-top"><div><h1>{{ titles[view] }}</h1></div><button class="avatar">管理员</button></header>
  <div class="content admin-content">
    <section v-if="view === 'overview'" class="admin-overview">
      <div class="admin-hero">
        <div><small>Jarsking 日程管理后台</small><h2>系统运行正常</h2><p>身份、预约、会议室与消息配置统一管理</p></div>
        <i></i>
      </div>
      <div class="admin-stats">
        <button @click="view='members'"><b>{{ managerCount }}</b><span>管理层成员</span></button>
        <button @click="view='rooms'"><b>{{ enabledRoomCount }}</b><span>启用会议室</span></button>
        <button><b>{{ pendingCount }}</b><span>等待老板审批</span></button>
      </div>
      <div class="section-title"><h2>预约记录</h2><span>管理员仅查看，不代审批</span></div>
      <div class="record-filters">
        <button v-for="item in ([['all','全部'],['pending','待审批'],['approved','已通过'],['rejected','已拒绝']] as const)" :key="item[0]" :class="{active:recordFilter===item[0]}" @click="recordFilter=item[0]">{{ item[1] }}</button>
      </div>
      <article v-for="item in filteredRecords" :key="item.id" class="admin-record">
        <header><div><h3>{{ item.topic }}</h3><p>{{ item.applicant }} · {{ item.room }}</p></div><span :class="item.status">{{ item.status==='pending'?'待审批':item.status==='approved'?'已通过':'已拒绝' }}</span></header>
        <time>{{ item.time }}</time>
      </article>
    </section>

    <section v-else-if="view === 'members'" class="admin-members">
      <div class="admin-note"><b>角色来源</b><p>正式上线后通过企业微信 UserID 匹配系统角色；只有符合角色的成员才能进入对应页面。</p></div>
      <label class="member-search"><span>⌕</span><input v-model="memberKeyword" placeholder="搜索姓名或部门"></label>
      <article v-for="member in filteredMembers" :key="member.id" class="member-card">
        <div class="member-avatar">{{ member.name.slice(0,1) }}</div>
        <div><h3>{{ member.name }}</h3><p>{{ member.department }} · {{ member.synced ? '企微已同步' : '未同步' }}</p></div>
        <select :value="member.role" @change="event => { const oldRole=member.role; member.role=(event.target as HTMLSelectElement).value as MemberRole; saveRole(member,oldRole) }">
          <option value="BOSS">老板</option><option value="MANAGEMENT">管理层</option><option value="ADMIN">管理员</option><option value="NONE">无权限</option>
        </select>
      </article>
    </section>

    <section v-else-if="view === 'rooms'" class="admin-rooms">
      <div class="admin-note"><b>独立会议室资源</b><p>停用后将不再出现在申请页面，历史预约记录仍会保留。</p></div>
      <article v-for="room in rooms" :key="room.id" class="admin-room-card" :class="{disabled:!room.enabled}">
        <div><h3>{{ room.name }}</h3><p>{{ room.capacity }}人 · {{ room.equipment }}</p></div>
        <button class="switch" :class="{on:room.enabled}" :aria-label="`${room.enabled?'停用':'启用'}${room.name}`" @click="toggleRoom(room)"><i></i></button>
      </article>
      <button class="admin-add" @click="emit('notify','新增会议室将在后端资源接口接入后开放')">＋ 新增会议室</button>
    </section>

    <section v-else class="admin-system">
      <div class="admin-note"><b>接口配置状态</b><p>密钥仅保存在服务端环境变量中，前端不展示或保存 API Secret。</p></div>
      <article v-for="item in integrations" :key="item.id" class="integration-card">
        <div class="integration-icon" :class="{ready:item.ready}">{{ item.ready ? '✓' : '!' }}</div>
        <div><h3>{{ item.name }}</h3><p>{{ item.detail }}</p><span :class="{ready:item.ready}">{{ item.state }}</span></div>
        <button @click="testIntegration(item)">测试</button>
      </article>
      <div class="section-title"><h2>固定业务规则</h2></div>
      <div class="rule-list">
        <p><span>可预约时间</span><b>09:00—18:00</b></p>
        <p><span>会前提醒</span><b>提前60分钟、10分钟</b></p>
        <p><span>审批人</span><b>仅石总本人</b></p>
        <p><span>待审批占用</span><b>不锁定时段</b></p>
      </div>
    </section>
  </div>
  <nav class="admin-nav">
    <button v-for="item in ([['overview','概览'],['members','成员'],['rooms','会议室'],['system','系统']] as const)" :key="item[0]" :class="{active:view===item[0]}" @click="view=item[0]"><b>{{ item[0]==='overview'?'▦':item[0]==='members'?'♙':item[0]==='rooms'?'▤':'⚙' }}</b>{{ item[1] }}</button>
  </nav>
</template>
