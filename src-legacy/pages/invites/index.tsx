import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Index page for invites - shows when no specific invite is selected
 */
export function InvitesIndexPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite details</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground border rounded-lg p-6 text-center">
          Select an invite to see details.
        </div>
      </CardContent>
    </Card>
  );
}

export default InvitesIndexPage;
