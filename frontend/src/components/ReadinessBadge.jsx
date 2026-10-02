const STYLES = {
  READY: "bg-[#10B981] text-white border-[#10B981]",
  ALMOST_READY: "bg-volt text-[#0A0A0A] border-volt",
  DEVELOPING: "bg-amber-100 text-amber-900 border-amber-300",
  NOT_READY: "bg-red-100 text-red-800 border-red-300",
  NOT_STARTED: "bg-muted text-muted-foreground border-border",
};

export const ReadinessBadge = ({ value, testId }) => (
  <span
    data-testid={testId}
    className={`inline-flex items-center border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${
      STYLES[value] || STYLES.NOT_STARTED
    }`}
  >
    {(value || "NOT_STARTED").replace(/_/g, " ")}
  </span>
);

export default ReadinessBadge;
