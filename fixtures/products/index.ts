import type { Product } from "../../packages/contracts";
const base = {
  condition: "",
  attributes: {},
  title: "",
  description: "",
  price: null,
  stock: null,
  shipping: "",
  warranty: "",
  variants: "",
  images: [],
  confirmed: false,
  version: 0,
  store: "main",
};
export const samples: Product[] = [
  {
    ...base,
    id: "airpods-pro-3",
    name: "AirPods Pro 3",
    brand: "Apple",
    model: "AirPods Pro 3",
    category: "耳機",
  },
  {
    ...base,
    id: "logitech-g304",
    name: "Logitech G304",
    brand: "Logitech",
    model: "G304",
    category: "滑鼠",
  },
  {
    ...base,
    id: "iphone-17-256gb",
    name: "iPhone 17 256GB",
    brand: "Apple",
    model: "iPhone 17",
    category: "手機",
    attributes: { 容量: "256GB" },
  },
];
