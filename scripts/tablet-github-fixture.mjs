export async function mockUpdates(page) {
  await page.route('https://api.github.com/**', route => {
    const url = new URL(route.request().url())
    const data = url.pathname.endsWith('/repos')
      ? ['FE', 'BE'].map(name => ({ name, default_branch: 'main', html_url: `https://github.com/AutoAI-UTEUM/${name}` }))
      : [{ sha: 'tablet-fixture', html_url: 'https://github.com/AutoAI-UTEUM/FE', commit: { author: { date: new Date().toISOString(), name: 'Tablet QA' }, committer: null, message: '태블릿 검증용 업데이트\n학습 화면과 목록 탐색을 확인합니다.' } }]
    return route.fulfill({ json: data })
  })
}
