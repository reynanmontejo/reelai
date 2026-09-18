import Link from 'next/link';

export default function Signup() {
  return <main className="auth"><section className="auth-card">
    <div className="logo">REEL<i>AI</i></div>
    <h1>No account required</h1>
    <p className="muted">ReelAI currently provides immediate guest access. Optional accounts and cross-device synchronization are planned but not active.</p>
    <Link className="primary" href="/">Start watching</Link>
    <p className="muted" style={{ textAlign: 'center' }}>Your guest preferences and progress are stored locally.</p>
  </section></main>;
}
