import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight, BarChart3, FileLock2, History, KeyRound, LayoutGrid, Mail, Menu, MessageCircle, Phone, Receipt, ShieldCheck, Users, Wallet, X,
} from 'lucide-react';
import { env } from '../../lib/env';
import { Link } from '../../lib/router';
import { LogoMark } from '../../app/Logo';
import { CinematicImage } from './CinematicImage';

const ease = [0.22, 1, 0.36, 1] as const;

const HERO_SLIDES = [
  { src: '/images/hero-1.jpg', alt: 'Aerial view of surveyed land parcels at golden hour' },
  { src: '/images/hero-2.jpg', alt: 'A modern residential development' },
  { src: '/images/hero-3.jpg', alt: 'Contemporary architecture in warm evening light' },
];

const NAV = [
  { href: '#home', label: 'Home' },
  { href: '#about', label: 'About' },
  { href: '#features', label: 'Features' },
  { href: '#contact', label: 'Contact' },
];

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }} transition={{ duration: 0.9, delay, ease }}>
      {children}
    </motion.div>
  );
}

function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={`flex items-center gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.32em] ${light ? 'text-gold' : 'text-gold-deep'}`}>
      <span className="h-px w-8 bg-current" />{children}
    </p>
  );
}

function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', k);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', k); };
  }, [open]);
  const solid = scrolled || open;

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${solid ? 'bg-ivory/95 shadow-[0_1px_0_rgba(28,26,23,0.08)] backdrop-blur' : 'bg-transparent'}`}>
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:h-20 sm:px-8">
        <a href="#home" className="flex items-center gap-2.5" aria-label="GUMADO home">
          <LogoMark className="h-8 w-8" light={!solid} />
          <span className={`font-serif text-[1.45rem] font-semibold tracking-[0.2em] transition-colors ${solid ? 'text-charcoal' : 'text-ivory'}`}>GUMADO</span>
        </a>
        <ul className="hidden items-center gap-8 md:flex">
          {NAV.map((n) => (
            <li key={n.href}><a href={n.href} className={`text-[0.8rem] font-semibold uppercase tracking-[0.16em] transition-colors ${solid ? 'text-charcoal/70 hover:text-charcoal' : 'text-ivory/80 hover:text-ivory'}`}>{n.label}</a></li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Link to="/sign-in" className={`hidden px-3 py-2 text-[0.8rem] font-semibold uppercase tracking-[0.16em] md:inline-block ${solid ? 'text-charcoal/80 hover:text-charcoal' : 'text-ivory/85 hover:text-ivory'}`}>Sign in</Link>
          <a href="#contact" className="hidden h-11 items-center bg-gold px-6 text-[0.78rem] font-bold uppercase tracking-[0.16em] text-charcoal transition-colors hover:bg-champagne md:inline-flex">Get started</a>
          <button type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="landing-menu" onClick={() => setOpen((v) => !v)}
            className={`grid h-11 w-11 place-items-center md:hidden ${solid ? 'text-charcoal' : 'text-ivory'}`}>
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div id="landing-menu" key="menu" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease }}
            className="border-t border-charcoal/10 bg-ivory px-5 pb-8 pt-2 md:hidden">
            <ul>
              {NAV.map((n) => (
                <li key={n.href} className="border-b border-charcoal/10">
                  <a href={n.href} onClick={() => setOpen(false)} className="flex items-center justify-between py-4 font-serif text-2xl text-charcoal">{n.label}<ArrowRight className="h-5 w-5 text-gold-deep" /></a>
                </li>
              ))}
            </ul>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Link to="/sign-in" className="flex h-12 items-center justify-center border border-charcoal/25 text-sm font-bold uppercase tracking-[0.14em] text-charcoal">Sign in</Link>
              <a href="#contact" onClick={() => setOpen(false)} className="flex h-12 items-center justify-center bg-charcoal text-sm font-bold uppercase tracking-[0.14em] text-ivory">Get started</a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const [slide, setSlide] = useState(0);
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % HERO_SLIDES.length), 7000);
    return () => clearInterval(t);
  }, [reduce]);

  // Subtle parallax: transform only, throttled to animation frames.
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = Math.min(window.scrollY, window.innerHeight);
        if (layer.current) layer.current.style.transform = `translate3d(0, ${y * 0.22}px, 0)`;
      });
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => { window.removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  }, [reduce]);

  const enter = (delay: number) => (reduce ? {} : { initial: { opacity: 0, y: 26 }, animate: { opacity: 1, y: 0 }, transition: { duration: 1.1, delay, ease } });

  return (
    <section id="home" className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-charcoal text-ivory">
      <div ref={layer} className="absolute inset-[-6%_0_-12%_0] -z-20 will-change-transform">
        {HERO_SLIDES.map((s, i) => (
          <div key={s.src} className="absolute inset-0 transition-opacity duration-[1600ms] ease-out" style={{ opacity: i === slide ? 1 : 0 }} aria-hidden={i !== slide}>
            <CinematicImage src={s.src} alt={s.alt} priority={i === 0} kenBurns={i === slide && !reduce} className="h-full w-full" />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-charcoal via-charcoal/55 to-charcoal/25" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-charcoal/70 via-transparent to-transparent" />

      <div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-32 sm:px-8 sm:pb-24 lg:pb-28">
        <motion.div {...enter(0.1)}><Eyebrow light>Every Plot · Every Transaction · Every Detail</Eyebrow></motion.div>
        <motion.h1 {...enter(0.22)} className="mt-6 max-w-4xl font-serif text-[3.1rem] font-medium leading-[0.95] tracking-[-0.01em] min-[400px]:text-[3.5rem] sm:text-7xl lg:text-[6.2rem]">
          Land is more<br />than property.
        </motion.h1>
        <motion.p {...enter(0.36)} className="mt-6 max-w-xl text-base leading-relaxed text-champagne/85 sm:text-lg">
          Discover a smarter way to manage plots, buyers, sales and property transactions.
        </motion.p>
        <motion.div {...enter(0.5)} className="mt-10 flex flex-col gap-3 min-[440px]:flex-row">
          <a href="#about" className="group inline-flex h-14 items-center justify-center gap-3 bg-gold px-8 text-[0.8rem] font-bold uppercase tracking-[0.18em] text-charcoal transition-colors hover:bg-champagne">
            Explore GUMADO <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </a>
          <a href="#contact" className="inline-flex h-14 items-center justify-center border border-ivory/40 px-8 text-[0.8rem] font-bold uppercase tracking-[0.18em] text-ivory transition-colors hover:border-ivory hover:bg-ivory/10">
            Get started
          </a>
        </motion.div>
        <div className="mt-14 flex items-center gap-2" role="tablist" aria-label="Hero images">
          {HERO_SLIDES.map((s, i) => (
            <button key={s.src} type="button" role="tab" aria-selected={i === slide} aria-label={`Show image ${i + 1}`} onClick={() => setSlide(i)}
              className="group relative h-6 w-12"><span className={`absolute inset-x-0 top-1/2 h-px transition-colors ${i === slide ? 'bg-gold' : 'bg-ivory/35 group-hover:bg-ivory/70'}`} /></button>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: LayoutGrid, title: 'Plot inventory', body: 'Register every plot with its reference, location, size, price, GPS coordinates and documents. Search and filter in seconds.' },
  { icon: Users, title: 'Buyer management', body: 'Buyer profiles with purchases, payment history and balances. Identification details are restricted to authorised staff.' },
  { icon: Receipt, title: 'Sales', body: 'Link one plot, one buyer and one agent to agreed terms. A plot can never be sold to two buyers at once.' },
  { icon: Wallet, title: 'Payment ledger', body: 'Record M-Pesa, bank, cash and cheque payments manually. Balances count only confirmed money.' },
  { icon: FileLock2, title: 'Private documents', body: 'Agreements, title-related papers and receipts stored privately, linked to the right plot, buyer or sale.' },
  { icon: BarChart3, title: 'Reports & analytics', body: 'Live dashboard and reports for sales, collections and outstanding balances. Export to PDF or Excel.' },
  { icon: KeyRound, title: 'Roles & permissions', body: 'Administrators, agents, finance and read-only staff each see and do only what their role allows.' },
  { icon: History, title: 'Audit trail', body: 'Every important change is recorded with who made it and when. Financial history is never erased.' },
];

const STEPS = [
  { n: '01', title: 'Register your plots', body: 'Build a single, searchable inventory of every parcel you sell.' },
  { n: '02', title: 'Welcome your buyers', body: 'Capture buyer details once and follow every interaction from there.' },
  { n: '03', title: 'Record the sale', body: 'Agree the price and terms; the plot is secured to that buyer instantly.' },
  { n: '04', title: 'Track every payment', body: 'Record instalments, confirm receipts and watch balances update in real time.' },
];

const BENEFITS = [
  { icon: ShieldCheck, title: 'One plot. One buyer.', body: 'The database itself prevents double sales, even when two people act at the same moment.' },
  { icon: Wallet, title: 'Money you can trust', body: 'Only confirmed payments count as collected. Pending and reversed payments are always shown separately.' },
  { icon: KeyRound, title: 'Access by role', body: 'Permissions are enforced on the server, not just hidden in the interface.' },
  { icon: History, title: 'Nothing quietly changes', body: 'Sales and payments are cancelled or reversed with a reason, never deleted.' },
];

export function LandingPage() {
  useEffect(() => {
    document.title = 'GUMADO — Land is more than property';
  }, []);
  const c = env.contact;

  return (
    <div className="bg-ivory font-sans text-charcoal">
      <LandingNav />
      <main>
        <Hero />

        {/* About */}
        <section id="about" className="scroll-mt-20 py-24 sm:py-32">
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:gap-24">
            <Reveal>
              <Eyebrow>About GUMADO</Eyebrow>
              <h2 className="mt-6 font-serif text-4xl font-medium leading-[1.05] sm:text-6xl">The quiet intelligence behind every land sale.</h2>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-charcoal/70">
                GUMADO is a land sales management platform built for businesses that sell plots. It brings your inventory, buyers, sales, payments and
                documents into one secure workspace — so you always know which plots are available, who owes what, and where every shilling stands.
              </p>
              <p className="mt-4 max-w-xl leading-relaxed text-charcoal/60">Designed for daily use on a phone in the field and on a desktop in the office.</p>
            </Reveal>
            <Reveal delay={0.15} className="relative">
              <div className="absolute -bottom-5 -right-5 hidden h-full w-full border border-gold/60 sm:block" aria-hidden />
              <CinematicImage src="/images/about.jpg" alt="Surveyed residential plots ready for development" className="relative aspect-[4/5] w-full" />
            </Reveal>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 bg-[#f3eee3] py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <Reveal className="max-w-2xl">
              <Eyebrow>The platform</Eyebrow>
              <h2 className="mt-6 font-serif text-4xl font-medium leading-[1.05] sm:text-6xl">Everything a land business runs on.</h2>
            </Reveal>
            <ul className="mt-16 grid gap-px overflow-hidden border border-charcoal/10 bg-charcoal/10 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f, i) => (
                <li key={f.title} className="bg-[#f3eee3]">
                  <Reveal delay={(i % 4) * 0.06} className="group h-full p-7 transition-colors duration-500 hover:bg-ivory sm:p-8">
                    <f.icon className="h-7 w-7 text-gold-deep transition-transform duration-500 group-hover:-translate-y-1" strokeWidth={1.4} />
                    <h3 className="mt-6 font-serif text-2xl font-semibold">{f.title}</h3>
                    <p className="mt-3 text-[0.95rem] leading-relaxed text-charcoal/65">{f.body}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section className="py-24 sm:py-32" aria-labelledby="how-title">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <Reveal className="max-w-2xl">
              <Eyebrow>How it works</Eyebrow>
              <h2 id="how-title" className="mt-6 font-serif text-4xl font-medium leading-[1.05] sm:text-6xl">From first plot to final payment.</h2>
            </Reveal>
            <ol className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {STEPS.map((s, i) => (
                <li key={s.n}>
                  <Reveal delay={i * 0.08}>
                    <p className="font-serif text-6xl font-medium text-gold/80">{s.n}</p>
                    <div className="mt-4 h-px w-full bg-charcoal/15" />
                    <h3 className="mt-6 text-lg font-bold">{s.title}</h3>
                    <p className="mt-2 leading-relaxed text-charcoal/65">{s.body}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Benefits */}
        <section className="relative isolate overflow-hidden bg-charcoal py-24 text-ivory sm:py-32" aria-labelledby="benefits-title">
          <CinematicImage src="/images/development.jpg" alt="" className="absolute inset-0 -z-20 h-full w-full opacity-40" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-charcoal via-charcoal/85 to-charcoal" />
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <Reveal className="max-w-2xl">
              <Eyebrow light>Business benefits</Eyebrow>
              <h2 id="benefits-title" className="mt-6 font-serif text-4xl font-medium leading-[1.05] sm:text-6xl">Certainty, built in.</h2>
            </Reveal>
            <ul className="mt-16 grid gap-x-10 gap-y-12 sm:grid-cols-2">
              {BENEFITS.map((b, i) => (
                <li key={b.title}>
                  <Reveal delay={(i % 2) * 0.08} className="flex gap-5">
                    <span className="grid h-12 w-12 shrink-0 place-items-center border border-gold/50 text-gold"><b.icon className="h-5 w-5" strokeWidth={1.5} /></span>
                    <div>
                      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
                      <p className="mt-2 max-w-md leading-relaxed text-champagne/75">{b.body}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="scroll-mt-20 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-24">
              <Reveal>
                <Eyebrow>Contact</Eyebrow>
                <h2 className="mt-6 font-serif text-4xl font-medium leading-[1.05] sm:text-6xl">Begin with a conversation.</h2>
                <p className="mt-6 max-w-lg text-lg leading-relaxed text-charcoal/70">Tell us about your land projects and we'll set up your GUMADO workspace.</p>
              </Reveal>
              <Reveal delay={0.1} className="space-y-4 self-end">
                {c.email || c.phone || c.whatsapp ? (
                  <>
                    {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-4 border-b border-charcoal/15 py-4 text-lg hover:text-gold-deep"><Mail className="h-5 w-5 text-gold-deep" />{c.email}</a>}
                    {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-4 border-b border-charcoal/15 py-4 text-lg hover:text-gold-deep"><Phone className="h-5 w-5 text-gold-deep" />{c.phone}</a>}
                    {c.whatsapp && <a href={`https://wa.me/${c.whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 border-b border-charcoal/15 py-4 text-lg hover:text-gold-deep"><MessageCircle className="h-5 w-5 text-gold-deep" />WhatsApp {c.whatsapp}</a>}
                  </>
                ) : (
                  <p className="border-b border-charcoal/15 py-4 text-charcoal/60">Contact details will appear here once configured.</p>
                )}
                <div className="pt-4">
                  <p className="text-sm text-charcoal/60">Already part of a GUMADO team?</p>
                  <Link to="/sign-in" className="mt-3 inline-flex h-14 items-center gap-3 bg-charcoal px-8 text-[0.8rem] font-bold uppercase tracking-[0.18em] text-ivory hover:bg-charcoal-2">
                    Staff sign in <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-charcoal/10 bg-[#f3eee3]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <LogoMark className="h-8 w-8" />
            <div>
              <p className="font-serif text-xl font-semibold tracking-[0.2em]">GUMADO</p>
              <p className="text-xs text-charcoal/60">Every Plot. Every Transaction. Every Detail.</p>
            </div>
          </div>
          <nav aria-label="Footer"><ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-charcoal/70">
            {NAV.map((n) => <li key={n.href}><a href={n.href} className="hover:text-charcoal">{n.label}</a></li>)}
            <li><Link to="/sign-in" className="hover:text-charcoal">Sign in</Link></li>
          </ul></nav>
          <p className="text-xs text-charcoal/50">© {new Date().getFullYear()} GUMADO</p>
        </div>
      </footer>
    </div>
  );
}
