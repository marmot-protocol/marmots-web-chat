import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopShell } from "@/layouts/desktop/shell";
import { MobileShell } from "@/layouts/mobile/shell";
import { Package, UsersIcon, Rss } from "lucide-react";
import { Link, useLocation } from "react-router";

const toolsNavItems = [
  {
    title: "Key Package Encoding",
    url: "/tools/key-package-encoding",
    icon: Package,
  },
  {
    title: "Group Metadata Encoding",
    url: "/tools/group-metadata-encoding",
    icon: UsersIcon,
  },
  {
    title: "Key Package Feed",
    url: "/tools/key-package-feed",
    icon: Rss,
  },
];

function DesktopToolsLayout() {
  const location = useLocation();

  const activeSubNavItem = toolsNavItems.find(
    (item) => location.pathname === item.url,
  )?.title;

  const nav = (
    <SidebarMenu>
      {toolsNavItems.map((item) => {
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
  );

  return <DesktopShell title="Tools" sidebar={nav} />;
}

function MobileToolsLayout() {
  return <MobileShell title="Tools" />;
}

export default function ToolsPage() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileToolsLayout /> : <DesktopToolsLayout />;
}
