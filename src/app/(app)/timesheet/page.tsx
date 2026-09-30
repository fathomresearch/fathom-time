import PageHeader from "@/components/PageHeader";
import Placeholder from "@/components/Placeholder";

export default function TimesheetPage() {
  return (
    <>
      <PageHeader title="Timesheet" />
      <Placeholder phase={5}>
        A Sunday to Saturday grid of hours by project and task. Editing a cell
        updates the same entries you see in the Time Tracker.
      </Placeholder>
    </>
  );
}
