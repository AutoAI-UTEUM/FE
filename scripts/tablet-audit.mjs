import { chromium, webkit, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { mockUpdates } from './tablet-github-fixture.mjs'

const phase = process.env.TABLET_PHASE ?? 'after'
const base = process.env.TABLET_URL ?? 'http://127.0.0.1:5180'
const folder = `qa-artifacts/tablet/${phase}`
await mkdir(folder, { recursive: true })
const routes = {
  PUBLIC: ['/login', '/signup', '/forgot-password', '/reset-password?token=fixture', '/auth/callback'],
  LEARNER: ['/classrooms', '/classrooms/12', '/materials', '/sessions/100', '/quizzes/50', '/sessions/100/diagnosis/42', '/notes', '/notes/new', '/notes/session/1/edit?sessionId=100', '/review-quizzes', '/exams', '/classrooms/12/exams/30', '/calendar', '/updates', '/settings', '/not-found'],
  INSTRUCTOR: ['/classrooms', '/classrooms/12', '/classrooms/12?panel=notice-new', '/classrooms/12?panel=exam-new', '/classrooms/12/settings', '/classrooms/12/analytics', '/classrooms/12/reports', '/classrooms/12/report-criteria', '/classrooms/12/students/1/reports', '/classrooms/12/students/1/reports/1', '/classrooms/12/exams/30', '/classrooms/12/exams/30/submissions/1', '/entrance-requests', '/calendar', '/settings'],
  ADMIN: ['/admin', '/admin?tab=classrooms', '/admin?tab=ai-usage', '/admin?tab=infra', '/admin?tab=updates'],
}
if (process.env.TABLET_ALIASES === '1') {
  routes.PUBLIC = []
  routes.LEARNER = ['/', '/sessions', '/materials/10', '/exams/30', '/classrooms/12/exams', '/classrooms/12/calendar']
  routes.INSTRUCTOR = ['/classrooms/12/students', '/classrooms/12/announcements', '/classrooms/12/edit', '/classrooms/12/entrance-requests', '/learning-status?classroomId=12', '/announcements?classroomId=12']
  routes.ADMIN = ['/settings']
}
const tablets = [[768,1024],[800,1280],[820,1180],[834,1194],[1024,1366]].flatMap(([w,h]) => [[w,h],[h,w]])
const cases = process.env.TABLET_FULL === '1'
  ? [...tablets.map(([width,height]) => ({ width,height,touch:true })), ...[375,507,600,700].map(width => ({width,height:900,touch:true,screen:{width:820,height:1180}})), ...[[1280,800],[1440,900],[1920,1080]].map(([width,height]) => ({width,height,touch:false})), ...[[360,800],[390,844],[430,932]].map(([width,height]) => ({width,height,touch:true}))]
  : [{width:820,height:1180,touch:true},{width:1180,height:820,touch:true},{width:600,height:900,touch:true,screen:{width:820,height:1180}}]
const results = []
const browserType = process.env.TABLET_BROWSER === 'webkit' ? webkit : chromium
const browser = await browserType.launch()
try {
  for (const size of cases.slice(Number(process.env.TABLET_CASE_START ?? 0))) {
    for (const [role, paths] of Object.entries(routes)) {
      const context = await browser.newContext({ viewport:{width:size.width,height:size.height}, screen:size.screen ?? {width:size.width,height:size.height}, hasTouch:size.touch, locale:'ko-KR', timezoneId:'Asia/Seoul' })
      const page = await context.newPage()
      await mockUpdates(page)
      await page.addInitScript(({width,height}) => {
        const orientation=new EventTarget()
        Object.defineProperty(orientation,'type',{get:()=>height>=width?'portrait-primary':'landscape-primary'})
        Object.defineProperties(Screen.prototype,{
          orientation:{configurable:true,get:()=>orientation},
          width:{configurable:true,get:()=>width},
          height:{configurable:true,get:()=>height},
        })
      },size.screen ?? size)
      page.setDefaultTimeout(12000)
      const errors=[]
      page.on('pageerror', error => errors.push(error.message))
      await page.route('https://accounts.google.com/**', route => route.abort())
      if (role === 'PUBLIC') await page.route('**/api/auth/refresh', route => route.fulfill({status:401,json:{success:false,error:{code:'TOKEN_INVALID',message:'signed out'}}}))
      else {
        await page.route('**/api/auth/refresh', route => route.fulfill({status:401,json:{success:false,error:{code:'TOKEN_INVALID',message:'signed out'}}}))
        await page.goto(`${base}/login`)
        await page.getByLabel('이메일', {exact:true}).fill(`${role.toLowerCase()}@example.com`)
        await page.locator('#login-password').fill('password123')
        await page.getByRole('button',{name:'로그인',exact:true}).click()
        await expect(page).not.toHaveURL(/\/login(?:\?|$)/)
        await page.unroute('**/api/auth/refresh')
        await page.route('**/api/users/me', route => route.fulfill({json:{success:true,message:'Mock',data:{id:1,email:`${role.toLowerCase()}@example.com`,name:role.toLowerCase(),role}}}))
        await page.route('**/api/auth/refresh', route => route.fulfill({json:{success:true,message:'Mock',data:{accessToken:'tablet-mock',expiresIn:3600,tokenType:'Bearer'}}}))
      }
      for (const path of paths.filter(path => !process.env.TABLET_PATH || new RegExp(process.env.TABLET_PATH).test(path))) {
        const key = `${size.width}x${size.height}-${size.touch?'touch':'pointer'}-${role}-${path.replace(/[^a-z0-9]+/gi,'-')}`
        const row = {browser:browserType.name(),width:size.width,height:size.height,touch:size.touch,screen:size.screen ?? {width:size.width,height:size.height},role,path,screenshot:`${folder}/${key}.png`,errors:[]}
        try {
          await page.goto(`${base}${path}`,{waitUntil:'networkidle',timeout:25000})
          await page.waitForTimeout(350)
          row.url=new URL(page.url()).pathname
          if (role !== 'PUBLIC' && row.url === '/login') throw new Error('Authentication redirect: protected page not verified')
          row.layout = await page.evaluate(() => {
            const root=document.documentElement
            const overflow=[...document.querySelectorAll('main *')].filter(el => { const r=el.getBoundingClientRect();return r.width>0 && r.right>innerWidth+2 && getComputedStyle(el).position!=='fixed' }).slice(0,12).map(el=>({tag:el.tagName,text:el.textContent?.slice(0,50),right:Math.round(el.getBoundingClientRect().right)}))
            const smallTargets=[...document.querySelectorAll('button,select,input:not([type=hidden]):not([type=checkbox]):not([type=radio]),summary,a[role=button]')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0 && r.height>0 && r.top<innerHeight && r.bottom>0 && (r.width<43.5 || r.height<43.5) && getComputedStyle(el).visibility!=='hidden'}).map(el=>({name:el.getAttribute('aria-label')||el.textContent?.slice(0,60),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))
            return {mode:root.dataset.responsiveMode,overflow:Math.max(root.scrollWidth,document.body.scrollWidth)-innerWidth,offscreen:overflow,smallTargets,headings:[...document.querySelectorAll('h1,h2')].map(el=>el.textContent),alerts:[...document.querySelectorAll('[role=alert]')].map(el=>el.textContent)}
          })
          if (phase !== 'before' && (size.width===820 || browserType.name()==='webkit')) {
            const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()
            row.accessibility=axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))
          }
          await page.screenshot({path:`${folder}/${key}.png`,fullPage:false})
          row.errors=errors.splice(0)
          row.status=row.layout.overflow>2 || row.errors.length || row.accessibility?.length ? 'FAIL' : 'PASS'
          if (row.layout.headings.some(h => /불러오지 못|찾을 수 없습니다/.test(h)) && path !== '/not-found') row.status='BLOCKED'
          if (row.layout.alerts.length && !['/auth/callback','/reset-password?token=fixture','/not-found'].includes(path)) row.status='FAIL'
        } catch(error) {row.status='BLOCKED';row.errors.push(error.message);errors.length=0}
        results.push(row)
        console.log(`${row.status} ${browserType.name()} ${key}${row.errors.length ? ` ${row.errors[0].slice(0,150)}`:''}`)
      }
      await context.close()
      await writeFile(`${folder}/results-${browserType.name()}.json`,JSON.stringify(results,null,2))
    }
  }
} finally {await browser.close()}
console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,blocked:results.filter(r=>r.status==='BLOCKED').length}))
