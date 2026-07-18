import { Link, Route, Router, Switch } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import HomePage from './pages/HomePage'
import DiagramPage from './pages/DiagramPage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  return (
    <Router hook={useHashLocation}>
      <nav>
        <Link href="/">Home</Link> | <Link href="/diagram">Diagram</Link>
      </nav>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/diagram" component={DiagramPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </Router>
  )
}

export default App
