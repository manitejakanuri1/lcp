-- A sale taken on the website is written into the till's books so the day's takings and the
-- GST return include it. Its payment method is none of cash, card or UPI from the shop's point
-- of view: the money arrives through Razorpay, whatever the customer tapped. "online" says that
-- plainly, and keeps the three counter methods meaning what they have always meant.
-- Re-runnable.

ALTER TABLE pos.bills DROP CONSTRAINT IF EXISTS bills_payment_method_check;
ALTER TABLE pos.bills ADD CONSTRAINT bills_payment_method_check
  CHECK (payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'upi'::text, 'online'::text]));
