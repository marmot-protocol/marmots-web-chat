import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import "./index.css";

import "@/lib/runtime";

import { ThemeProvider } from "./components/theme-providers";
import { SidebarProvider } from "./components/ui/sidebar";

import ContactsPage from "./pages/contacts.tsx";
import ContactDetailPage from "./pages/contacts/[npub].tsx";
import ContactsIndexPage from "./pages/contacts/index.tsx";
import GroupsPage from "./pages/groups.tsx";
import GroupDetailPage from "./pages/groups/[id].tsx";
import GroupAdminPage from "./pages/groups/[id]/admin.tsx";
import GroupChatPage from "./pages/groups/[id]/chat.tsx";
import GroupMembersPage from "./pages/groups/[id]/members.tsx";
import CreateGroupPage from "./pages/groups/create.tsx";
import GroupsIndexPage from "./pages/groups/index.tsx";
import HomePage from "./pages/index.tsx";
import InvitesPage from "./pages/invites.tsx";
import InviteDetailPage from "./pages/invites/[rumorId].tsx";
import InvitesIndexPage from "./pages/invites/index.tsx";
import KeyPackagePage from "./pages/key-packages.tsx";
import KeyPackageDetailPage from "./pages/key-packages/[id].tsx";
import CreateKeyPackagePage from "./pages/key-packages/create.tsx";
import ProfilePage from "./pages/profile.tsx";
import SettingsPage from "./pages/settings.tsx";
import SettingsAccountPage from "./pages/settings/account.tsx";
import SettingsAccountsPage from "./pages/settings/accounts.tsx";
import MarmotSettingsPage from "./pages/settings/marmot";
import SettingsRelaysPage from "./pages/settings/relays.tsx";
import SignInPage from "./pages/signin.tsx";
import SignInBunkerPage from "./pages/signin/bunker.tsx";
import SignInQRPage from "./pages/signin/connect-qr.tsx";
import SignInNewUserPage from "./pages/signin/create.tsx";
import SignInExtensionPage from "./pages/signin/extension.tsx";
import SignInIndexPage from "./pages/signin/index.tsx";
import ToolsPage from "./pages/tools";
import GroupMetadataEncodingPage from "./pages/tools/group-metadata-encoding.tsx";
import KeyPackageDecoderPage from "./pages/tools/key-package-encoding.tsx";
import KeyPackageFeedPage from "./pages/tools/key-package-feed.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "400px",
          } as React.CSSProperties
        }
      >
        <BrowserRouter basename={import.meta.env.VITE_BASE_PATH}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/groups" element={<GroupsPage />}>
              <Route index element={<GroupsIndexPage />} />
              <Route path="create" element={<CreateGroupPage />} />
              <Route path=":id" element={<GroupDetailPage />}>
                <Route index element={<GroupChatPage />} />
                <Route path="chat" element={<GroupChatPage />} />
                <Route path="members" element={<GroupMembersPage />} />
                <Route path="admin" element={<GroupAdminPage />} />
              </Route>
            </Route>
            <Route path="/invites" element={<InvitesPage />}>
              <Route index element={<InvitesIndexPage />} />
              <Route path=":rumorId" element={<InviteDetailPage />} />
            </Route>
            <Route path="/key-packages" element={<KeyPackagePage />}>
              <Route path="create" element={<CreateKeyPackagePage />} />
              <Route path=":id" element={<KeyPackageDetailPage />} />
            </Route>
            <Route path="/signin" element={<SignInPage />}>
              <Route index element={<SignInIndexPage />} />
              <Route path="new-user" element={<SignInNewUserPage />} />
              <Route path="extension" element={<SignInExtensionPage />} />
              <Route path="bunker" element={<SignInBunkerPage />} />
              <Route path="qr" element={<SignInQRPage />} />
            </Route>
            <Route path="/contacts" element={<ContactsPage />}>
              <Route path=":npub" element={<ContactDetailPage />} />
              <Route index element={<ContactsIndexPage />} />
            </Route>
            <Route path="/tools" element={<ToolsPage />}>
              <Route
                path="key-package-encoding"
                element={<KeyPackageDecoderPage />}
              />
              <Route
                path="group-metadata-encoding"
                element={<GroupMetadataEncodingPage />}
              />
              <Route path="key-package-feed" element={<KeyPackageFeedPage />} />
            </Route>
            <Route path="/settings" element={<SettingsPage />}>
              <Route
                index
                element={<Navigate to="/settings/accounts" replace />}
              />
              <Route path="marmot" element={<MarmotSettingsPage />} />
              <Route path="relays" element={<SettingsRelaysPage />} />
              <Route path="account" element={<SettingsAccountPage />} />
              <Route path="accounts" element={<SettingsAccountsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SidebarProvider>
    </ThemeProvider>
  </StrictMode>,
);
