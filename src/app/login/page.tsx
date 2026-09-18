import Link from 'next/link';

export default function Login() {
  return <main className="auth"><section className="auth-card">
    <div className="logo">REEL<i>AI</i></div>
    <h1>Guest access is ready</h1>
    <p className="muted">Accounts are optional and are not enabled in this prototype. Your list, likes, history, and playback progress stay on this device.</p>
    <Link className="primary" href="/">Continue as guest</Link>
    <p className="muted" style={{ textAlign: 'center' }}>Account sync will be introduced in a later phase.</p>
  </section></main>;
}
