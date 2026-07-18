import { Link } from 'wouter'

function NotFoundPage() {
  return (
    <section>
      <h1>404</h1>
      <p>
        找不到這個頁面。<Link href="/">回首頁</Link>
      </p>
    </section>
  )
}

export default NotFoundPage
