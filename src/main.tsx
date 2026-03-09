import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import "./index.css";

import "@/lib/runtime";

import { ThemeProvider } from "./components/theme-providers";
import { SidebarProvider } from "./components/ui/sidebar";

import ContactsPage from "./pages/contacts/_layout.tsx";
import ContactDetailPage from "./pages/contacts/[npub].tsx";
import ContactsIndexPage from "./pages/contacts/index.tsx";
import GroupsPage from "./pages/groups/_layout.tsx";
import GroupDetailPage from "./pages/groups/[id]/_layout.tsx";
import GroupAdminPage from "./pages/groups/[id]/admin/index.tsx";
import GroupChatPage from "./pages/groups/[id]/chat/index.tsx";
import GroupTreePage from "./pages/groups/[id]/tree/index.tsx";
import GroupEventsPage from "./pages/groups/[id]/timeline/index.tsx";
import GroupMediaPage from "./pages/groups/[id]/media/index.tsx";
import GroupMembersPage from "./pages/groups/[id]/members/index.tsx";
import CreateGroupPage from "./pages/groups/create.tsx";
import GroupsIndexPage from "./pages/groups/index.tsx";
import HomePage from "./pages/index.tsx";
import InvitesPage from "./pages/invites/_layout.tsx";
import InviteDetailPage from "./pages/invites/[rumorId].tsx";
import InvitesIndexPage from "./pages/invites/index.tsx";
import KeyPackagePage from "./pages/key-packages/_layout.tsx";
import KeyPackageDetailPage from "./pages/key-packages/[id].tsx";
import CreateKeyPackagePage from "./pages/key-packages/create.tsx";
import ProfilePage from "./pages/profile.tsx";
import SettingsPage from "./pages/settings/_layout.tsx";
import SettingsAccountPage from "./pages/settings/account.tsx";
import SettingsAccountsPage from "./pages/settings/accounts.tsx";
import MarmotSettingsPage from "./pages/settings/marmot";
import SettingsRelaysPage from "./pages/settings/relays.tsx";
import BlossomSettingsPage from "./pages/settings/blossom.tsx";
import SignInPage from "./pages/signin/_layout.tsx";
import SignInBunkerPage from "./pages/signin/bunker.tsx";
import SignInQRPage from "./pages/signin/connect-qr.tsx";
import SignInNewUserPage from "./pages/signin/create.tsx";
import SignInExtensionPage from "./pages/signin/extension.tsx";
import SignInIndexPage from "./pages/signin/index.tsx";
import ToolsPage from "./pages/tools/_layout.tsx";
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
                <Route path="tree" element={<GroupTreePage />} />
                <Route path="timeline" element={<GroupEventsPage />} />
                <Route path="media" element={<GroupMediaPage />} />
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
              <Route path="blossom" element={<BlossomSettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SidebarProvider>
    </ThemeProvider>
  </StrictMode>,
);
