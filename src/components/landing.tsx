'use client';

import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import Link from 'next/link';
import { LogoMark } from './logo-mark';

export function Landing() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        tl.from('.land-logo', { y: -10, duration: 0.5, ease: 'back.out(1.7)' })
          .from('.land-eyebrow', { x: -14, duration: 0.4 }, '<0.05')
          .from(
            '.land-title-word',
            { y: 22, stagger: 0.06, duration: 0.55, ease: 'back.out(1.4)' },
            '<0.1',
          )
          .from('.land-tagline', { y: 10, duration: 0.45 }, '<0.2')
          .from('.land-feature', { y: 14, stagger: 0.08, duration: 0.4 }, '<0.05')
          .from(
            '.land-cta',
            { y: 10, scale: 0.92, duration: 0.5, ease: 'back.out(1.6)' },
            '<0.1',
          )
          .from(
            '.land-brick',
            {
              scale: 0.4,
              rotate: -20,
              stagger: { each: 0.025, from: 'random' },
              duration: 0.45,
              ease: 'back.out(2)',
            },
            0.1,
          );

        gsap.to('.land-brick', {
          y: () => gsap.utils.random(-3, 3),
          duration: () => gsap.utils.random(1.4, 2.4),
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          stagger: { each: 0.08, from: 'random' },
          delay: 1.6,
        });

        gsap.to('.land-cta', {
          boxShadow: '8px 8px 0 var(--ink)',
          repeat: -1,
          yoyo: true,
          duration: 1.2,
          ease: 'sine.inOut',
          delay: 1.5,
        });

        gsap.to('.land-marquee-track', {
          xPercent: -50,
          duration: 26,
          repeat: -1,
          ease: 'none',
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="grain relative min-h-dvh overflow-hidden">
      {/* TOP NAV */}
      <header className="relative z-10 flex items-center justify-between border-b-2 border-ink bg-paper px-6 py-4 md:px-10">
        <div className="flex items-center gap-3 land-logo">
          <LogoMark size={32} />
          <span className="display-xl text-[20px] tracking-tight">BLOCKED</span>
        </div>
        <Link
          href="/studio"
          className="press inline-block bg-paper px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink"
        >
          Open Studio →
        </Link>
      </header>

      {/* HERO */}
      <section className="relative grid grid-cols-1 gap-10 px-6 pt-12 pb-20 md:px-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16 lg:pt-16 lg:pb-28">
        <div className="flex flex-col justify-center">
          <span className="land-eyebrow font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-red">
            ◉ Image → 3D Voxel · Brick Edition
          </span>

          <h1 className="display-xl mt-6 text-[64px] leading-[0.86] tracking-tight md:text-[92px] lg:text-[112px]">
            <span className="land-title-word inline-block">DROP.</span>{' '}
            <span className="land-title-word inline-block text-red">TUNE.</span>{' '}
            <span className="land-title-word inline-block">BUILD.</span>
          </h1>

          <p className="land-tagline mt-6 max-w-xl text-[18px] leading-snug text-ink md:text-[20px]">
            Take any image. Get a 3D voxel brick build, instantly. A
            serious tool for serious play —{' '}
            <span className="font-bold">no AI guessing, no waiting, no costs.</span>
          </p>

          <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Link
              href="/studio"
              className="press land-cta inline-flex items-center gap-3 bg-red px-7 py-4 text-paper"
            >
              <span className="display-xl text-[18px] tracking-tight">START BUILDING</span>
              <span className="font-mono text-[14px]">→</span>
            </Link>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-2">
              Drop a PNG · Get bricks · It's instant
            </span>
          </div>

          <ul className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Feature index="01" title="Edge-aware depth" body="Silhouettes round, not slab" />
            <Feature index="02" title="Brick palette snap" body="34 official colors only" />
            <Feature index="03" title="Live preview" body="Tune knobs, see updates" />
          </ul>
        </div>

        {/* HERO VISUAL — animated brick stack */}
        <div className="relative flex items-center justify-center">
          <div className="relative aspect-square w-full max-w-[440px]">
            <div className="absolute inset-0 grid grid-cols-7 grid-rows-7 gap-1.5 p-3">
              {GRID_PATTERN.flatMap((row, ry) =>
                row.map((cell, rx) => {
                  if (!cell) {
                    return (
                      <div
                        key={`${ry}-${rx}-empty`}
                        className="opacity-0"
                        aria-hidden
                      />
                    );
                  }
                  const colorVar = COLOR_MAP[cell] ?? 'var(--paper-2)';
                  return (
                    <div
                      key={`${ry}-${rx}`}
                      className="land-brick border-2 border-ink"
                      style={{
                        background: colorVar,
                        boxShadow: '3px 3px 0 var(--ink)',
                      }}
                    />
                  );
                }),
              )}
            </div>
            <div className="absolute -bottom-2 left-0 right-0 flex justify-between font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-2">
              <span>FIG. 00 — SAMPLE</span>
              <span>7 × 7 UNITS</span>
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE FOOTER */}
      <div className="land-marquee absolute bottom-0 left-0 right-0 overflow-hidden border-t-2 border-ink bg-ink py-3">
        <div className="land-marquee-track flex whitespace-nowrap font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-paper">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="flex shrink-0 items-center gap-6 pr-6">
              <span>◉ DROP IMAGE</span>
              <span>◉ AUTO-VOXELIZE</span>
              <span>◉ BRICK PALETTE</span>
              <span>◉ ROTATE 360°</span>
              <span>◉ TUNE LIVE</span>
              <span>◉ NO API · NO COSTS</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Feature({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <li className="land-feature border-2 border-ink bg-paper p-3">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-red">
        {index}
      </div>
      <div className="mt-1 text-[13px] font-bold leading-tight text-ink">{title}</div>
      <div className="mt-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-2">
        {body}
      </div>
    </li>
  );
}

const COLOR_MAP: Record<string, string> = {
  R: 'var(--red)',
  Y: 'var(--yellow)',
  B: 'var(--blue)',
  K: 'var(--ink)',
  W: 'var(--paper)',
  P: 'var(--paper-2)',
};

// 7×7 little dragon-y silhouette
const GRID_PATTERN: string[][] = [
  ['', '', 'R', 'R', '', '', ''],
  ['', 'R', 'R', 'R', 'R', '', ''],
  ['', 'R', 'K', 'R', 'K', 'R', ''],
  ['R', 'R', 'R', 'R', 'R', 'R', ''],
  ['R', 'R', 'Y', 'R', 'R', 'R', 'R'],
  ['', 'R', 'R', 'R', 'R', 'R', ''],
  ['', 'R', '', '', 'R', '', ''],
];
