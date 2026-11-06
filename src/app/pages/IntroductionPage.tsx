import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Layers3,
  Maximize2,
  MessageCircle,
  Monitor,
  RotateCcw,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'

import { usePageTitle } from '../../shared/lib/usePageTitle'
import { routes } from '../routes'
import './IntroductionPage.css'

const screens = [
  {
    id: 'explanation',
    label: '자료와 AI 설명',
    icon: BookOpen,
    image: '/intro/learning.webp',
    width: 1920,
    height: 999,
    alt: '왼쪽 PDF 강의자료와 오른쪽 현재 페이지의 AI 설명을 함께 보는 으뜸 학습 화면',
    title: '보던 자료 옆에서, 바로 이해하기',
    description: '강의자료를 읽다가 막히면 AI에게 질문하세요. 현재 페이지를 바탕으로 설명하고, 더 궁금한 내용도 이어서 물어볼 수 있어요.',
    caption: 'PDF 뷰어와 AI 학습 패널',
  },
  {
    id: 'quiz',
    label: '이해도 퀴즈',
    icon: ClipboardCheck,
    image: '/intro/quiz.webp',
    width: 1189,
    height: 370,
    alt: '학습한 내용을 O와 X 중에서 골라 답하는 으뜸 퀴즈 풀이 화면',
    title: '읽은 내용을, 내 지식으로 확인하기',
    description: '설명을 읽는 것과 직접 답하는 것은 다르니까요. 객관식·OX·단답형·서술형 퀴즈로 학습한 내용을 점검해요.',
    caption: '네 가지 퀴즈 유형 중 OX 예시',
  },
  {
    id: 'feedback',
    label: '오답 교정',
    icon: RotateCcw,
    image: '/intro/feedback.webp',
    width: 1240,
    height: 553,
    alt: '학습자가 적은 답변을 바탕으로 헷갈린 개념과 올바른 연결을 다시 설명하는 으뜸 오답 교정 화면',
    title: '틀렸다는 결과보다, 왜 틀렸는지',
    description: '채점에서 끝나지 않아요. 헷갈린 개념을 짚어 주고, 보충 설명과 다시 확인하는 질문으로 다음 학습을 도와줘요.',
    caption: '학습자의 답변에 이어지는 교정 설명',
  },
] as const

const learningSteps = [
  { icon: FileText, title: '자료를 읽어요', text: '새 교재를 만들 필요 없이, 수업에서 쓰던 PDF 자료로 시작해요.' },
  { icon: MessageCircle, title: '궁금한 걸 물어요', text: '현재 페이지를 바탕으로 설명을 듣고, 이해되지 않은 부분을 더 질문해요.' },
  { icon: ClipboardCheck, title: '퀴즈로 확인해요', text: '학습한 범위의 문제를 풀며 내가 이해한 내용을 직접 확인해요.' },
  { icon: RotateCcw, title: '헷갈린 건 다시 배워요', text: '오답의 원인을 살피고 보충 설명과 재학습으로 개념을 연결해요.' },
]

const questions = [
  { title: '일반 AI 챗봇과 무엇이 다른가요?', answer: '으뜸은 강의자료와 지금 보고 있는 페이지, 앞서 나눈 질문과 퀴즈 결과를 학습 흐름 안에서 연결해요. 질문에 답하는 데서 그치지 않고 설명, 이해도 점검, 오답 교정으로 학습이 이어지도록 돕습니다.' },
  { title: '어떤 분들이 사용할 수 있나요?', answer: '강의자료를 복습하는 학생, 직무교육을 듣는 학습자, 수업을 운영하는 강의자가 사용할 수 있어요. 기존 PDF 자료를 활용하므로 대학 수업과 비교과 과정, 기업 교육 등 다양한 학습에 활용할 수 있습니다.' },
  { title: 'AI가 설명하는 내용은 항상 맞나요?', answer: 'AI의 설명과 채점에는 오류가 있을 수 있어요. 중요한 개념은 원문 자료와 함께 확인하고, 판단이 어려운 내용은 강의자에게 질문해 주세요. 으뜸은 학습을 돕는 도구이며 강의자의 판단을 대신하지 않습니다.' },
]

export function IntroductionPage() {
  usePageTitle('으뜸 서비스 소개 | USF 2026')
  const [activeScreen, setActiveScreen] = useState(0)
  const [preview, setPreview] = useState<(typeof screens)[number] | null>(null)
  const [isZoomed, setIsZoomed] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([])
  const screen = screens[activeScreen]

  useEffect(() => {
    const dialog = dialogRef.current
    if (preview && dialog && !dialog.open) dialog.showModal()
  }, [preview])

  function closePreview() {
    dialogRef.current?.close()
    setPreview(null)
    setIsZoomed(false)
  }

  function selectScreen(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % screens.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + screens.length) % screens.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = screens.length - 1
    else return
    event.preventDefault()
    setActiveScreen(nextIndex)
    tabsRef.current[nextIndex]?.focus()
  }

  return (
    <div className="uteum-intro">
      <a className="intro-skip" href="#intro-main">본문으로 바로가기</a>
      <header className="intro-header">
        <div className="intro-wrap intro-header-inner">
          <a aria-label="으뜸 소개 처음으로" className="intro-brand" href="#intro-main">으뜸<span>UTEUM</span></a>
          <nav aria-label="소개 페이지 메뉴">
            <a className="intro-nav-link" href="#intro-screens">학습 화면</a>
            <a className="intro-header-cta" href="#intro-start">직접 사용하기<ArrowRight aria-hidden="true" size={15} /></a>
          </nav>
        </div>
      </header>

      <main id="intro-main">
        <section aria-labelledby="intro-title" className="intro-hero">
          <div className="intro-wrap">
            <p className="intro-event"><span />USF 2026<span className="intro-event-divider">/</span>지역창업 페스티벌</p>
            <h1 aria-label="으뜸 UTEUM" id="intro-title">으뜸<span>UTEUM</span></h1>
            <p className="intro-hero-headline">같은 강의,<br />나에게 맞춘 학습.</p>
            <p className="intro-hero-description">내 강의자료를 바탕으로 설명부터 퀴즈,<br className="intro-phone-break" /> 헷갈린 개념의 교정까지.<br />배우는 과정에 AI 튜터가 함께합니다.</p>
            <a className="intro-explore" href="#intro-flow">어떻게 배우나요?<ArrowDown aria-hidden="true" size={16} /></a>
            <figure className="intro-hero-figure">
              <button aria-label="실제 으뜸 학습 화면 확대" className="intro-hero-image" onClick={() => setPreview(screens[0])} type="button">
                <img alt={screens[0].alt} fetchPriority="high" height={999} src={screens[0].image} width={1920} />
                <span className="intro-image-action"><Maximize2 aria-hidden="true" size={15} />확대</span>
              </button>
              <figcaption><span className="intro-live-dot" />실제 으뜸 학습 화면<span>PDF 자료 + AI 튜터</span></figcaption>
            </figure>
          </div>
        </section>

        <section aria-labelledby="intro-flow-title" className="intro-section intro-flow" id="intro-flow">
          <div className="intro-wrap">
            <p className="intro-eyebrow">하나로 이어지는 학습</p>
            <h2 id="intro-flow-title">읽고, 묻고, 풀고.<br />이해하는 과정까지 함께.</h2>
            <p className="intro-section-description">각각의 기능을 찾아다닐 필요 없이,<br className="intro-phone-break" /> 한 학습 흐름에서 이어집니다.</p>
            <ol className="intro-step-list">
              {learningSteps.map((step, index) => <li key={step.title}>
                <div className="intro-step-top"><span className="intro-step-number">0{index + 1}</span><step.icon aria-hidden="true" size={22} strokeWidth={1.6} /></div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>)}
            </ol>
          </div>
        </section>

        <section aria-labelledby="intro-screens-title" className="intro-section intro-screens" id="intro-screens">
          <div className="intro-wrap">
            <div className="intro-section-heading">
              <div><p className="intro-eyebrow">화면으로 만나는 으뜸</p><h2 id="intro-screens-title">배움은 이렇게 이어져요.</h2></div>
              <p className="intro-gallery-note">실제 서비스 화면</p>
            </div>
            <div aria-label="학습 화면 종류" className="intro-tabs" role="tablist">
              {screens.map((item, index) => <button aria-controls={`intro-panel-${item.id}`} aria-selected={index === activeScreen} id={`intro-tab-${item.id}`} key={item.id} onClick={() => setActiveScreen(index)} onKeyDown={(event) => selectScreen(event, index)} ref={(element) => { tabsRef.current[index] = element }} role="tab" tabIndex={index === activeScreen ? 0 : -1} type="button"><item.icon aria-hidden="true" size={17} />{item.label}</button>)}
            </div>
            <div aria-labelledby={`intro-tab-${screen.id}`} className="intro-screen-panel" id={`intro-panel-${screen.id}`} role="tabpanel" tabIndex={0}>
              <button aria-label={`${screen.label} 화면 확대`} className="intro-screen-image" onClick={() => setPreview(screen)} type="button">
                <img alt={screen.alt} decoding="async" height={screen.height} loading="lazy" src={screen.image} width={screen.width} />
                <span className="intro-image-action"><Maximize2 aria-hidden="true" size={15} />확대</span>
              </button>
              <div className="intro-screen-description"><div><span className="intro-screen-index">0{activeScreen + 1}<span> / 03</span></span><h3>{screen.title}</h3><p>{screen.description}</p></div><span className="intro-screen-caption">{screen.caption}</span></div>
            </div>
          </div>
        </section>

        <section aria-labelledby="intro-together-title" className="intro-section intro-together">
          <div className="intro-wrap">
            <p className="intro-eyebrow">혼자 배워도, 함께 가르쳐도</p>
            <h2 id="intro-together-title">학습자에게는 나만의 튜터.<br />강의자에게는 함께 보는 기록.</h2>
            <div className="intro-audiences">
              <article><GraduationCap aria-hidden="true" size={29} strokeWidth={1.5} /><h3>배우는 사람</h3><p>질문은 편하게,<br />복습은 내 이해에 맞게.</p><ul><li><Check aria-hidden="true" size={16} />강의자료를 보며 바로 질문</li><li><Check aria-hidden="true" size={16} />퀴즈와 피드백으로 이해도 점검</li><li><Check aria-hidden="true" size={16} />노트와 학습 기록으로 다시 복습</li></ul></article>
              <article><Layers3 aria-hidden="true" size={29} strokeWidth={1.5} /><h3>가르치는 사람</h3><p>점수 너머,<br />학생의 배움 과정을 확인.</p><ul><li><Check aria-hidden="true" size={16} />질문·퀴즈·진도·교정 기록 확인</li><li><Check aria-hidden="true" size={16} />학생별 강점과 취약 개념 파악</li><li><Check aria-hidden="true" size={16} />학습 리포트를 수업 지도에 활용</li></ul></article>
            </div>
            <p className="intro-agent-note"><Sparkles aria-hidden="true" size={19} /><span>설명·질문·퀴즈·채점·교정·리포트.<br className="intro-phone-break" /> 역할이 다른 AI들이 학습 흐름을 연결합니다.</span></p>
          </div>
        </section>

        <section aria-labelledby="intro-faq-title" className="intro-section intro-faq">
          <div className="intro-wrap intro-faq-layout">
            <div><p className="intro-eyebrow">조금 더 궁금하다면</p><h2 id="intro-faq-title">자주 묻는 질문</h2></div>
            <div>{questions.map((question) => <details key={question.title}><summary>{question.title}<ChevronDown aria-hidden="true" size={18} /></summary><p>{question.answer}</p></details>)}</div>
          </div>
        </section>

        <section aria-labelledby="intro-start-title" className="intro-start" id="intro-start">
          <div className="intro-wrap">
            <Monitor aria-hidden="true" className="intro-start-icon" size={32} strokeWidth={1.5} />
            <p className="intro-eyebrow">직접 만나보세요</p>
            <h2 id="intro-start-title">이제, 내 자료로 배워볼까요?</h2>
            <p className="intro-start-description">모바일에서도 사용할 수 있지만,<br />강의자료와 AI 대화를 함께 보려면<br className="intro-phone-break" /> <strong>PC 웹 버전이 더 편리합니다.</strong></p>
            <Link className="intro-primary-button" to={routes.classrooms}>으뜸 사용하기<ArrowRight aria-hidden="true" size={19} /></Link>
            <span className="intro-service-address">www.uteum.com</span>
          </div>
        </section>
      </main>

      <footer className="intro-footer"><div className="intro-wrap"><a className="intro-brand" href="#intro-main">으뜸<span>UTEUM</span></a><p>울산대학교 · 팀 AutoAI<br /><span>김종훈 · 고영빈 · 이감재 · 한승준</span></p><p className="intro-footer-event">2026 지역창업 페스티벌<br />USF 팝업스토어 · 전시부스</p></div></footer>

      <dialog aria-label={preview ? `${preview.label} 확대 보기` : '학습 화면 확대 보기'} className="intro-image-dialog" onClick={(event) => { if (event.target === event.currentTarget) closePreview() }} onClose={() => { setPreview(null); setIsZoomed(false) }} ref={dialogRef}>
        {preview ? <div className="intro-dialog-content"><div className="intro-dialog-header"><h2>{preview.label}</h2><div><button aria-label={isZoomed ? '화면에 맞추기' : '원본 크기로 확대'} aria-pressed={isZoomed} onClick={() => setIsZoomed((value) => !value)} title={isZoomed ? '화면에 맞추기' : '원본 크기로 확대'} type="button">{isZoomed ? <ZoomOut aria-hidden="true" size={20} /> : <ZoomIn aria-hidden="true" size={20} />}</button><button aria-label="확대 화면 닫기" onClick={closePreview} title="닫기" type="button"><X aria-hidden="true" size={21} /></button></div></div><div className={`intro-dialog-scroll${isZoomed ? ' is-zoomed' : ''}`}><img alt={preview.alt} height={preview.height} src={preview.image} width={preview.width} /></div></div> : null}
      </dialog>
    </div>
  )
}
