import { useTranslation } from "react-i18next";
import App from "../App";

export function LocalizedApp() {
  useTranslation();
  return <App />;
}
