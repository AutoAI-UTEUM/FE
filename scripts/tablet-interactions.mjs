import { chromium, webkit, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { mockUpdates } from './tablet-github-fixture.mjs'

const engine = process.env.TABLET_BROWSER === 'webkit' ? webkit : chromium
const browser = await engine.launch()
const folder = `qa-artifacts/tablet/interactions-${engine.name()}`
await mkdir(folder, { recursive: true })
const results = []
async function run(name, role, action) {
  const context = await browser.newContext({viewport:{width:820,height:1180},screen:{width:820,height:1180},hasTouch:true,locale:'ko-KR'})
  const page = await context.newPage()
  await mockUpdates(page)
  page.setDefaultTimeout(15000)
  await page.addInitScript(() => {
    window.qaOrientation = 'portrait-primary'
    const orientation=new EventTarget()
    Object.defineProperty(orientation,'type',{get:() => window.qaOrientation})
    Object.defineProperties(Screen.prototype,{
      orientation:{configurable:true,get:()=>orientation},
      width:{configurable:true,get:()=>window.qaOrientation.startsWith('portrait')?820:1180},
      height:{configurable:true,get:()=>window.qaOrientation.startsWith('portrait')?1180:820},
    })
  })
  const requests = []
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push({path:new URL(request.url()).pathname,method:request.method()}) })
  const row = {name, role}
  try {
    await page.goto('http://127.0.0.1:5180/login')
    await page.getByLabel('이메일',{exact:true}).fill(`${role === 'learner.qa' ? `learner.qa.${Date.now()}` : role}@example.com`)
    await page.locator('#login-password').fill('password123')
    await page.getByRole('button',{name:'로그인',exact:true}).click()
    await expect(page).not.toHaveURL(/\/login/)
    await action(page, requests)
    row.status='PASS'
  } catch(error) {row.status='FAIL';row.error=error.message}
  await page.screenshot({path:`${folder}/${name}.png`,fullPage:false})
  results.push(row)
  console.log(JSON.stringify(row))
  await context.close()
  await writeFile(`${folder}/results.json`,JSON.stringify(results,null,2))
}
async function rotate(page,width=1180,height=820) {
  await page.evaluate(() => {window.qaOrientation='landscape-primary';window.dispatchEvent(new Event('orientationchange'))})
  await page.setViewportSize({width,height})
}
try {
  await run('long-edit-workspace-actions','instructor',async(page) => {
    for(const [panel,label,save] of [['exam-new','시험 제목','초안 저장'],['notice-new','공지 제목','공지 게시']]) {
      await page.goto(`http://127.0.0.1:5180/classrooms/12?panel=${panel}`)
      await page.getByLabel(label,{exact:true}).fill('회전 중 작성 내용')
      await page.setViewportSize({width:375,height:900})
      await expect.poll(async()=>{const r=await page.getByRole('button',{name:save,exact:true}).boundingBox();return r.y+r.height}).toBeLessThanOrEqual(900)
      await rotate(page)
      await expect(page.getByLabel(label,{exact:true})).toHaveValue('회전 중 작성 내용')
      await expect.poll(async()=>{const r=await page.getByRole('button',{name:save,exact:true}).boundingBox();return r.y+r.height}).toBeLessThanOrEqual(820)
      const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()
      expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact))).toEqual([])
    }
  })
  await run('navigation-focus-return','learner',async(page) => {
    const opener=page.getByRole('button',{name:'메뉴 펼치기'})
    await opener.click()
    const menu=page.getByRole('dialog',{name:'주요 메뉴'})
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(opener).toBeFocused()
  })
  await run('streaming-rotation-no-duplicate','learner',async(page,requests) => {
    await page.goto('http://127.0.0.1:5180/sessions/100')
    await page.evaluate(() => {
      const fetchOriginal=window.fetch
      window.qaStreamCount=0
      window.fetch=(input,init)=> {
        const url=String(input instanceof Request ? input.url : input)
        if(!url.endsWith('/api/sessions/100/stream')) return fetchOriginal(input,init)
        window.qaStreamCount++
        const encoder=new TextEncoder()
        return Promise.resolve(new Response(new ReadableStream({start(controller){
          controller.enqueue(encoder.encode('event: content_delta\ndata: {"text":"회전 중에도 "}\n\n'))
          setTimeout(()=>{controller.enqueue(encoder.encode('event: content_delta\ndata: {"text":"응답이 이어집니다."}\n\nevent: completed\ndata: {"result":{}}\n\n'));controller.close()},1500)
        }}),{headers:{'Content-Type':'text/event-stream'}}))
      }
    })
    await page.route('**/api/sessions/100/turns',async route=> {
      await new Promise(resolve=>setTimeout(resolve,2800))
      await route.fulfill({json:{success:true,message:'QA',data:{messages:[{messageId:9001,senderType:'AI',messageType:'QA',content:'회전 중에도 응답이 이어집니다.',createdAt:new Date().toISOString()}],state:{},uiActions:[]}}})
    })
    const controls=page.getByRole('group',{name:'학습 화면 보기'})
    await controls.getByRole('button',{name:'학습',exact:true}).click()
    await page.getByPlaceholder('현재 페이지에 대해 질문…').fill('화면 회전 중 답변을 확인합니다.')
    await page.getByRole('button',{name:'질문 보내기',exact:true}).click()
    await expect(page.getByText('회전 중에도', {exact:true})).toBeVisible()
    await rotate(page)
    await controls.getByRole('button',{name:'자료',exact:true}).click()
    await page.setViewportSize({width:507,height:900})
    await controls.getByRole('button',{name:'학습',exact:true}).click()
    await expect(page.getByText('회전 중에도 응답이 이어집니다.',{exact:true})).toBeVisible()
    await expect(page.getByRole('button',{name:'질문 보내기',exact:true})).toBeVisible()
    expect(await page.evaluate(()=>window.qaStreamCount)).toBe(1)
    expect(requests.filter(r=>r.path==='/api/sessions/100/turns')).toHaveLength(1)
  })
  await run('quiz-answer-review-pane-preservation','learner',async(page) => {
    await page.goto('http://127.0.0.1:5180/quizzes/50')
    await page.locator('label:has(input[type=radio])').first().click()
    await rotate(page)
    await expect(page.getByRole('radio').first()).toBeChecked()
    await page.getByRole('button',{name:'다음 문항'}).click()
    await page.locator('label:has(input[type=radio])').first().click()
    await page.getByRole('button',{name:'제출',exact:true}).click()
    const controls=page.getByRole('group',{name:'학습 화면 보기'})
    await controls.getByRole('button',{name:'복습',exact:true}).click()
    const input=page.getByPlaceholder('푼 퀴즈에 대해 질문…')
    await input.fill('복습 질문 유지')
    await controls.getByRole('button',{name:'퀴즈',exact:true}).click()
    await expect(page.getByRole('radio').first()).toBeChecked()
    await expect(page.getByRole('radio').first()).toBeDisabled()
    await page.setViewportSize({width:507,height:900})
    await controls.getByRole('button',{name:'복습',exact:true}).click()
    await expect(input).toHaveValue('복습 질문 유지')
  })
  await run('workspace-state-focus-keyboard','learner',async(page,requests) => {
    await page.goto('http://127.0.0.1:5180/sessions/100')
    const controls=page.getByRole('group',{name:'학습 화면 보기'})
    await expect(controls.getByRole('button',{name:'함께 보기'})).toBeVisible()
    const draft=page.getByPlaceholder('현재 페이지에 대해 질문…')
    await draft.fill('화면 전환 중 보존할 질문')
    const pageNumber=await page.locator('[role=progressbar]').getAttribute('aria-label')
    const initialGets=requests.filter(r=>r.path==='/api/sessions/100' && r.method==='GET').length
    await controls.getByRole('button',{name:'자료',exact:true}).click()
    await expect(draft).toBeHidden()
    await controls.getByRole('button',{name:'학습',exact:true}).click()
    await expect(draft).toHaveValue('화면 전환 중 보존할 질문')
    await rotate(page)
    await controls.getByRole('button',{name:'함께 보기'}).click()
    await expect(page.locator('[role=progressbar]')).toHaveAttribute('aria-label',pageNumber)
    await page.setViewportSize({width:507,height:900})
    await expect(controls.getByRole('button',{name:'함께 보기'})).toHaveCount(0)
    await controls.getByRole('button',{name:'학습',exact:true}).click()
    await expect(draft).toHaveValue('화면 전환 중 보존할 질문')
    expect(requests.filter(r=>r.path==='/api/sessions/100' && r.method==='GET')).toHaveLength(initialGets)
    await page.evaluate(() => {
      Object.defineProperty(visualViewport,'height',{configurable:true,value:420})
      visualViewport.dispatchEvent(new Event('resize'))
    })
    await expect(page.locator('html')).toHaveAttribute('data-responsive-mode','tablet-landscape')
    await expect.poll(async()=> (await draft.boundingBox()).y+(await draft.boundingBox()).height).toBeLessThanOrEqual(420)
    await controls.getByRole('button',{name:'자료',exact:true}).click()
    const opener=page.getByRole('button',{name:'자료 목록',exact:true})
    await opener.click()
    await expect(page.getByRole('button',{name:'자료 목록 닫기'})).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog',{name:'자료 목록'})).toHaveCount(0)
    await expect(opener).toBeFocused()
  })
  await run('exam-draft-rotation-submit-lock','learner.qa',async(page) => {
    await page.goto('http://127.0.0.1:5180/classrooms/12/exams/30')
    const answer=page.getByPlaceholder('답안을 입력하세요')
    await answer.fill('순차 자료구조를 이해했습니다.')
    await rotate(page)
    await page.reload()
    await expect(answer).toHaveValue('순차 자료구조를 이해했습니다.')
    await expect(page.getByRole('button',{name:'시험 제출',exact:true})).toHaveCount(0)
    await page.getByRole('button',{name:'다음',exact:true}).click()
    await page.getByRole('radio').last().check()
    await page.getByRole('button',{name:'다음',exact:true}).click()
    await answer.fill('스택은 LIFO, 큐는 FIFO입니다.')
    let confirmation=''
    page.once('dialog',async dialog => {confirmation=dialog.message();await dialog.accept()})
    await page.getByRole('button',{name:'시험 제출',exact:true}).click()
    expect(confirmation).toContain('전체 3문항 중 3문항')
    await expect(page.getByRole('heading',{name:'시험 제출 및 채점이 완료되었습니다'})).toBeVisible()
    await expect(answer).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('heading',{name:'시험 제출 및 채점이 완료되었습니다'})).toBeVisible()
  })
  await run('admin-list-detail-return','admin',async(page) => {
    await page.goto('http://127.0.0.1:5180/admin')
    const row=page.locator('.tablet-summary-row').first()
    await row.click()
    await expect(page.getByRole('button',{name:'목록으로 돌아가기'})).toBeVisible()
    await rotate(page,1366,1024)
    await expect(row).toBeVisible()
    await page.getByRole('button',{name:'목록으로 돌아가기'}).click()
    await expect(row).toBeFocused()
  })
  await run('note-editor-rotation','learner',async(page) => {
    await page.goto('http://127.0.0.1:5180/notes/new')
    const editor=page.locator('[contenteditable=true]').first()
    await editor.fill('화면 회전 후에도 남아 있어야 하는 노트 내용')
    await rotate(page)
    await page.setViewportSize({width:375,height:900})
    await expect(editor).toContainText('화면 회전 후에도 남아 있어야 하는 노트 내용')
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()
    expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact))).toEqual([])
  })
  await run('admin-loading-error-empty-long','admin',async(page) => {
    let response='loading'
    await page.route('**/api/admin/users?*',async route=> {
      if(response==='loading') {await new Promise(resolve=>setTimeout(resolve,600));response='error'}
      if(response==='error') return route.fulfill({status:503,json:{success:false,error:{code:'UNAVAILABLE',message:'QA temporary error',details:[]}}})
      return route.fulfill({json:{success:true,message:'QA',data:{items:response==='empty'?[]:Array.from({length:20},(_,i)=>({id:i+1,name:'아주 긴 이름 반복 '.repeat(5),email:`long-${i}-${'a'.repeat(60)}@example.com`,role:'LEARNER',status:'ACTIVE',authProvider:'LOCAL',createdAt:'2026-09-19T01:00:00Z'})),page:0,size:20,totalElements:response==='empty'?0:20,totalPages:1}}})
    })
    await page.goto('http://127.0.0.1:5180/admin')
    await expect(page.getByText('회원 정보를 불러오는 중입니다.')).toBeVisible()
    await expect(page.getByText('QA temporary error')).toBeVisible()
    response='empty';await page.reload()
    await expect(page.getByText(/조건에 맞는 회원|회원이 없습니다|검색 결과가 없습니다/)).toBeVisible()
    response='long';await page.reload()
    await page.setViewportSize({width:375,height:900})
    await expect(page.locator('.tablet-summary-row')).toHaveCount(20)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2)
    const last=page.locator('.tablet-summary-row').last()
    await last.scrollIntoViewIfNeeded()
    const list=page.locator('.tablet-master-detail > div').first()
    const scrollTop=await list.evaluate(el=>el.scrollTop)
    await last.click()
    await page.getByRole('button',{name:'목록으로 돌아가기'}).click()
    expect(await list.evaluate(el=>el.scrollTop)).toBe(scrollTop)
  })
} finally {await browser.close()}
if(results.some(r=>r.status==='FAIL')) process.exitCode=1
