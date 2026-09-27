/** Local-shop customer + item masters for fast demos (no AI paste needed). */

export type CatalogCustomer = {
  id: string;
  name: string;
  gstin?: string;
  phone?: string;
  email?: string;
  city: string;
};

export type CatalogItem = {
  id: string;
  description: string;
  hsn: string;
  rate: number;
  gstPercent: number;
  unit: string;
};

export const CATALOG_CUSTOMERS: CatalogCustomer[] = [
  {
    id: "c-kirana",
    name: "Sharma Kirana Store",
    gstin: "27AABCS1111K1Z9",
    phone: "9876543210",
    city: "Pune",
  },
  {
    id: "c-hardware",
    name: "Patel Hardware Mart",
    gstin: "24AABCP2222H1Z4",
    phone: "9825012345",
    city: "Ahmedabad",
  },
  {
    id: "c-garments",
    name: "Mehta Garments",
    gstin: "24AABCM3333G1Z7",
    phone: "9909988776",
    city: "Surat",
  },
  {
    id: "c-walkin",
    name: "Walk-in Customer",
    phone: "9999999999",
    city: "Local",
  },
  {
    id: "c-urban",
    name: "Urban Wear Retail Pvt Ltd",
    gstin: "07AABCU9988W1Z3",
    phone: "9811122333",
    email: "pay@urbanwear.in",
    city: "Delhi",
  },
];

export const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: "i-carton",
    description: "Corrugated cartons",
    hsn: "4819",
    rate: 45,
    gstPercent: 18,
    unit: "pcs",
  },
  {
    id: "i-tape",
    description: "Packaging tape roll",
    hsn: "3919",
    rate: 35,
    gstPercent: 18,
    unit: "roll",
  },
  {
    id: "i-pouch",
    description: "Polymer pouches",
    hsn: "3923",
    rate: 2.4,
    gstPercent: 18,
    unit: "pcs",
  },
  {
    id: "i-label",
    description: "Printed labels",
    hsn: "4821",
    rate: 0.5,
    gstPercent: 18,
    unit: "pcs",
  },
  {
    id: "i-job",
    description: "Job work / fabrication",
    hsn: "9988",
    rate: 5000,
    gstPercent: 18,
    unit: "job",
  },
  {
    id: "i-steel",
    description: "MS angle / steel section",
    hsn: "7216",
    rate: 68,
    gstPercent: 18,
    unit: "kg",
  },
];
