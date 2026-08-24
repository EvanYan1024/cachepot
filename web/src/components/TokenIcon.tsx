// Icons live in /public/tokens (CC0, github.com/spothq/cryptocurrency-icons)
export function TokenIcon({ symbol, className }: { symbol: string; className?: string }) {
  return <img src={`/tokens/${symbol.toLowerCase()}.svg`} alt={symbol} className={className} />;
}
