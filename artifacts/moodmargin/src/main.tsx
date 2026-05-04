import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";
import { getApiBaseUrl } from "./lib/api-base";

setBaseUrl(getApiBaseUrl());

createRoot(document.getElementById("root")!).render(<App />);
