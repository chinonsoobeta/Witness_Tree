import { RECEIPT_CONTENT_TYPE, RECEIPT_SIZE, receiptAlt, receiptImage, receiptStaticParams } from "@/lib/share/receipt";

// The place's share card, rendered from the same summary as its page, with
// the figure's caveats in the pixels (lib/share/receipt.tsx). A route handler
// does not inherit the page's parameters, so it names the same places itself.
export const alt = receiptAlt("en");
export const size = RECEIPT_SIZE;
export const contentType = RECEIPT_CONTENT_TYPE;
export const dynamicParams = false;

export function generateStaticParams() {
  return receiptStaticParams();
}

export default function Image({ params }: { params: Promise<{ dataVersion: string; geography: string; code: string }> }) {
  return receiptImage("en", params);
}
