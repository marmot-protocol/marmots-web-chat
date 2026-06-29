import { Navigate, Route, Routes } from "react-router";
import { use$ } from "applesauce-react/hooks";

import { accounts } from "@/lib/accounts";
import { AppLayout } from "@/components/app-layout";
import { SignInPage } from "@/pages/signin";
import { GroupsIndexPage } from "@/pages/groups-index";
import { GroupChatPage } from "@/pages/group-chat";
import { GroupDebugPage } from "@/pages/group-debug";
import { SettingsPage } from "@/pages/settings";

export function App() {
  const account = use$(accounts.active$);

  return (
    <Routes>
      <Route path="/signin" element={<SignInPage />} />
      {account ? (
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/groups" replace />} />
          <Route path="/groups" element={<GroupsIndexPage />} />
          <Route path="/groups/:id" element={<GroupChatPage />} />
          <Route path="/groups/:id/debug" element={<GroupDebugPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/groups" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/signin" replace />} />
      )}
    </Routes>
  );
}
