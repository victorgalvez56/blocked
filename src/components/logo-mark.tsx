export function LogoMark({ size = 44 }: { size?: number }) {
  const w = size;
  const h = size * 0.85;
  return (
    <div
      className="relative shrink-0"
      style={{ width: w, height: h + 8 }}
      aria-hidden
    >
      <div
        className="absolute"
        style={{
          left: 7,
          top: 0,
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: 'var(--paper)',
          border: '2px solid var(--ink)',
          zIndex: 2,
        }}
      />
      <div
        className="absolute"
        style={{
          right: 7,
          top: 0,
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: 'var(--paper)',
          border: '2px solid var(--ink)',
          zIndex: 2,
        }}
      />
      <div
        className="absolute"
        style={{
          top: 6,
          left: 0,
          width: w,
          height: h,
          background: 'var(--red)',
          border: '2px solid var(--ink)',
          boxShadow: '4px 4px 0 var(--ink)',
        }}
      />
    </div>
  );
}
