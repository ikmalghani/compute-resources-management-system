type IconProps = { className?: string };

function Base({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className || "h-[18px] w-[18px]"} aria-hidden="true">
      {children}
    </svg>
  );
}

export function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-10 w-10" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#123f45" />
      <rect x="8" y="9" width="16" height="11" rx="2.5" fill="#00968a" />
      <path d="M11 23h10" stroke="#b8fff2" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="16" cy="14.5" r="2" fill="#f3fffc" />
    </svg>
  );
}

export const DashboardIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Base>
);

export const WorkspaceIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" />
    <path d="M12 12.2 20 8.5" />
    <path d="M12 12.2V20" />
    <path d="M12 12.2 4 8.5" />
  </Base>
);

export const GpuIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="3" y="7" width="18" height="10" rx="2" />
    <path d="M7 17v2M12 17v2M17 17v2M8 7V5M16 7V5" />
  </Base>
);

export const UsersIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M16 20v-1.2A3.8 3.8 0 0 0 12.2 15H7.8A3.8 3.8 0 0 0 4 18.8V20" />
    <circle cx="10" cy="8" r="3" />
    <path d="M20 20v-1.1A3.2 3.2 0 0 0 17.2 16" />
    <path d="M16 5.2a2.6 2.6 0 0 1 0 4.6" />
  </Base>
);

export const ActivityIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M8 6.5h8" />
    <path d="M8 12h8" />
    <path d="M8 17.5h5" />
    <rect x="4" y="3.5" width="16" height="17" rx="2" />
  </Base>
);

export const SearchIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Base>
);

export const BellIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M6 16.5h12l-1.2-2.1V10a4.8 4.8 0 0 0-9.6 0v4.4L6 16.5Z" />
    <path d="M10 16.5a2 2 0 0 0 4 0" />
  </Base>
);

export const PlusIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const TerminalIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="m7 9 3 2.5L7 14" />
    <path d="M12 14h5" />
  </Base>
);
