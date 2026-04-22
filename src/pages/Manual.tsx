import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  {
    title: "Getting Started",
    items: ["Sign in from /auth", "Use sidebar to open modules", "Use profile page to update your details"],
  },
  {
    title: "Front Desk and Visitors",
    items: [
      "Use Front Desk for staff-assisted visitor check-in",
      "Use Visitor Kiosk for self-service visitor check-in/out",
      "Return visitors can be searched by name and auto-filled",
    ],
  },
  {
    title: "Assets and Inventory",
    items: [
      "Track devices in Assets and monitor live battery status",
      "Issue assets to staff or active visitors",
      "Manage stock and checkouts in Inventory",
    ],
  },
  {
    title: "People Operations",
    items: [
      "Attendance supports live clock-in/out and admin oversight",
      "Duty Roster supports weekly and monthly planning",
      "Calendar and Tasks coordinate operations",
    ],
  },
  {
    title: "Analytics",
    items: [
      "Operational analytics: daily execution metrics",
      "Executive analytics: trend and monthly comparative views",
      "Use export buttons for CSV reporting",
    ],
  },
];

export default function Manual() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Operations Manual</h1>
        <p className="text-muted-foreground mt-1">How to operate ACMtaani Hub end-to-end</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="text-lg">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
