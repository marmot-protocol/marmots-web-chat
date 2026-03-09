import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileShell } from "@/layouts/mobile-shell";
import {
  HardDriveUploadIcon,
  KeyIcon,
  Network,
  User,
  Users,
} from "lucide-react";
import { Link, Outlet, useLocation } from "react-router";

const settingsNavItems = [
  {
    title: "Accounts",
    url: "/settings/accounts",
    icon: Users,
  },
  {
    title: "Account",
    url: "/settings/account",
    icon: User,
  },
  {
    title: "Marmot",
    url: "/settings/marmot",
    icon: KeyIcon,
  },
  {
    title: "Relays",
    url: "/settings/relays",
    icon: Network,
  },
  {
    title: "Media",
    url: "/settings/blossom",
    icon: HardDriveUploadIcon,
  },
];

function DesktopSettingsLayout() {
  const location = useLocation();

  const activeSubNavItem = settingsNavItems.find(
    (item) => location.pathname === item.url,
  )?.title;

  return (
    <>
      <AppSidebar title="Settings">
        <SidebarMenu>
          {settingsNavItems.map((item) => {
            const isActive = activeSubNavItem === item.title;
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  className="px-2.5 md:px-2"
                >
                  <Link to={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </AppSidebar>
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </>
  );
}

function MobileSettingsLayout() {
  return <MobileShell title="Settings" />;
}

export default function SettingsPage() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileSettingsLayout /> : <DesktopSettingsLayout />;
}
