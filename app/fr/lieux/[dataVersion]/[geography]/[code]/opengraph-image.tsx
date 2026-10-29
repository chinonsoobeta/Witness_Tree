import { RECEIPT_CONTENT_TYPE, RECEIPT_SIZE, receiptAlt, receiptImage, receiptStaticParams } from "@/lib/share/receipt";

// La carte de partage du lieu, tirée du même résumé que sa page, avec les
// réserves du chiffre inscrites dans l’image (lib/share/receipt.tsx). Un
// gestionnaire de route n’hérite pas des paramètres de la page : il nomme
// donc lui-même les mêmes lieux.
export const alt = receiptAlt("fr");
export const size = RECEIPT_SIZE;
export const contentType = RECEIPT_CONTENT_TYPE;
export const dynamicParams = false;

export function generateStaticParams() {
  return receiptStaticParams();
}

export default function Image({ params }: { params: Promise<{ dataVersion: string; geography: string; code: string }> }) {
  return receiptImage("fr", params);
}
