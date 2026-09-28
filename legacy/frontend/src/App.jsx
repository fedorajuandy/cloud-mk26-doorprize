import { Router, Route } from "@solidjs/router";
import MainLayout from "./layouts/MainLayout";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Wishes from "./pages/Wishes";
import SubmitWish from "./pages/SubmitWish";
import { lazy } from "solid-js";
const WishDisplay = lazy(() => import("./pages/WishDisplay"));
import SystemSettings from "./pages/SystemSettings";

export default function App() {
  return (
    <Router>
      <Route path="/login" component={Login} />
      <Route path="/phone" component={() => <SubmitWish transport="ws" />} />
      <Route path="/ipad" component={() => <SubmitWish transport="sse" />} />
      <Route path="/display" component={() => <ProtectedRoute><WishDisplay /></ProtectedRoute>} />

      <Route path="/" component={(props) => (
        <ProtectedRoute>
          <MainLayout>{props.children}</MainLayout>
        </ProtectedRoute>
      )}>
        {/* Wishes administration */}
        <Route path="/" component={Wishes} />
        <Route path="/admin-settings" component={SystemSettings} />
      </Route>
    </Router>
  );
}
