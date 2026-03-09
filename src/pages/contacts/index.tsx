import {
  IconLoader2,
  IconMailbox,
  IconUserOff,
  IconUsersGroup,
} from "@tabler/icons-react";
import { use$ } from "applesauce-react/hooks";

import { PageBody } from "@/components/page-body";
import { PageHeader } from "@/components/page-header";
import { withActiveAccount } from "@/components/with-active-account";
import { useIsMobile } from "@/hooks/use-mobile";
import { user$ } from "@/lib/accounts";
import { liveGroups$, liveUnreadInvites$ } from "@/lib/marmot-client";
import { ContactList, ContactListSearchForm } from "@/pages/contacts/_layout";
import {
  StartChatDialog,
  useOnlineContactsKeyPackages,
  useStartChat,
} from "@/pages/contacts/components/online-contacts";
import {
  RecentKeyPackageCard,
  RecentKeyPackagesFeed,
} from "@/pages/contacts/components/recent-key-packages";
import { Link } from "react-router";
import { Button } from "../../components/ui/button";

function ContactsIndexDesktop() {
  const contacts = use$(user$.contacts$);
  const groups = use$(liveGroups$);
  const chat = useStartChat();

  const isLoading = contacts === undefined || groups === undefined;

  const onlineContacts = useOnlineContactsKeyPackages();

  return (
    <>
      <PageHeader items={[{ label: "Home", to: "/" }, { label: "Contacts" }]} />
      <PageBody>
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Who's Online</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Contacts with a key package published in the last 24 hours — click
              to start a secure chat
            </p>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <IconLoader2 className="h-4 w-4 animate-spin" />
              Loading contacts…
            </div>
          )}

          {/* No Nostr contacts at all */}
          {!isLoading && contacts?.length === 0 && (
            <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
              <IconUserOff className="h-5 w-5 shrink-0" />
              <span>
                Follow people on Nostr and they'll appear here when they're
                ready to chat.
              </span>
            </div>
          )}

          {/* Online contacts grid — cards self-hide when not online */}
          {onlineContacts && onlineContacts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {onlineContacts.map((kp) => (
                <RecentKeyPackageCard
                  key={kp.pubkey}
                  event={kp}
                  onStartChat={chat.startChat}
                  isCreating={chat.isCreating}
                />
              ))}
            </div>
          )}
        </div>

        <RecentKeyPackagesFeed
          onStartChat={chat.startChat}
          isCreating={chat.isCreating}
        />

        <StartChatDialog {...chat} />
      </PageBody>
    </>
  );
}

/** Link to the explore (Who's Online) page. For mobile layout. */
export function ContactListExploreButton() {
  return (
    <Button variant="outline" className="flex-1 justify-center gap-2" asChild>
      <Link to="/contacts/explore">Explore</Link>
    </Button>
  );
}

/** Link to the invites page with an unread count badge. For mobile layout. */
export function ContactListInvitesButton() {
  const unread = use$(liveUnreadInvites$);
  const count = unread?.length ?? 0;
  return (
    <Button variant="outline" className="flex-1 justify-center gap-2" asChild>
      <Link to="/invites">
        Invites
        {count > 0 && (
          <span className="ml-auto bg-primary text-primary-foreground text-xs font-medium rounded-full px-2 py-0.5 leading-none">
            {count}
          </span>
        )}
      </Link>
    </Button>
  );
}

/** Mobile: explore + invites buttons at top, list, search form at bottom. */
function ContactListContentMobile() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 p-2 border-b">
        <ContactListInvitesButton />
        <ContactListExploreButton />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ContactList />
      </div>
      <ContactListSearchForm />
    </div>
  );
}

function ContactsIndexPage() {
  const isMobile = useIsMobile();
  return isMobile ? <ContactListContentMobile /> : <ContactsIndexDesktop />;
}

export default withActiveAccount(ContactsIndexPage);
