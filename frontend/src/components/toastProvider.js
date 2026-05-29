"use client";

import { Toaster } from "react-hot-toast";

export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      reverseOrder={false}
      toastOptions={{
        style: {
          background: "#333",
          color: "#fff",
        },
      }}
    />
  );
}