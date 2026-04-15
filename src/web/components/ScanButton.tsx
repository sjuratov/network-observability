interface ScanButtonProps {
  loading: boolean;
  onClick: () => void;
}

export function ScanButton({ loading, onClick }: ScanButtonProps) {
  return (
    <button
      data-testid="btn-scan-now"
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 w-full justify-center ${
        loading
          ? 'bg-[#1c2128] text-[#6e7681] cursor-not-allowed'
          : 'bg-[#1f6feb] text-white hover:bg-[#388bfd]'
      }`}
    >
      {loading ? (
        <>
          <span className="animate-spin inline-block">⟳</span>
          Scanning…
        </>
      ) : (
        <>
          <span>⟳</span>
          Scan Now
        </>
      )}
    </button>
  );
}
