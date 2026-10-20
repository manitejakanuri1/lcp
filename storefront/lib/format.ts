export function formatPrice(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
