// UI v81 round 2 (owner 07/11/2026): Property › Inspections, the menu item of design v81.
// DL-243: the Joint Inspections at move-in and move-out are listed first, and
// "#/inspections/ji:<id>" opens one (the tablet form while it is a Draft). The older move-out
// inspections and the Unit Checks the Staff bot sends are still found where they were.

import { JointInspectionForm } from "../joint/JointInspectionForm";
import { JointInspectionsList } from "../joint/JointInspectionsList";
import {
  type JointApi,
  jointApi as defaultJointApi,
} from "../joint/jointClient";
import { Icon } from "../shell/icons";
import { hashForPage } from "../shell/navigation";
import { PageHead } from "../shell/pageHead";
import { useHashDetail } from "../shell/useHashPage";
import type { Language } from "../signInText";

// Khmer is new and needs the native check.
const TEXT = {
  sub: [
    "Joint Inspections at move-in and move-out, and Unit Checks during a Lease",
    "ការត្រួតពិនិត្យរួមពេលចូល និងចាកចេញ និងការត្រួតពិនិត្យបន្ទប់ក្នុងពេលជួល",
  ],
  // Property fix 5 (owner 14/11/2026): plain words for staff, no build-step notes.
  soon_t: ["Other inspections", "ការត្រួតពិនិត្យផ្សេងទៀត"],
  soon: [
    "Older move-out inspections and Unit Checks are found here:",
    "ការត្រួតពិនិត្យពេលចាកចេញចាស់ៗ និងការត្រួតពិនិត្យបន្ទប់ មាននៅទីនេះ៖",
  ],
  moveout: [
    "The move-out inspection and its findings are on the Lease's Move-out page.",
    "ការត្រួតពិនិត្យពេលចាកចេញ និងលទ្ធផលរបស់វា នៅលើទំព័រចាកចេញរបស់កិច្ចសន្យា។",
  ],
  moveout_open: ["Open Move-outs", "បើកការចាកចេញ"],
  checks: [
    "A Unit Check sent from the Staff bot makes a Problem report for each finding.",
    "ការត្រួតពិនិត្យបន្ទប់ដែលផ្ញើពីបូតបុគ្គលិក បង្កើតរបាយការណ៍បញ្ហាសម្រាប់លទ្ធផលនីមួយៗ។",
  ],
  checks_open: ["Open Problem reports", "បើករបាយការណ៍បញ្ហា"],
} as const;

function t(language: Language, key: keyof typeof TEXT): string {
  return TEXT[key][language === "en" ? 0 : 1];
}

export function InspectionsPage({
  language,
  active = true,
  propertyId = "",
  capabilities = null,
  api = defaultJointApi,
}: {
  language: Language;
  /** Whether the page is on screen (its sub-line then sits in the shell's head row). */
  active?: boolean;
  propertyId?: string;
  capabilities?: ReadonlySet<string> | null;
  api?: JointApi;
}) {
  const detail = useHashDetail("inspections");
  const may = (capability: string) =>
    capabilities === null || capabilities.has(capability);
  if (propertyId !== "" && detail?.startsWith("ji:") === true) {
    const inspectionId = detail.slice(3);
    return (
      <JointInspectionForm
        api={api}
        inspectionId={inspectionId}
        key={`${inspectionId}:${propertyId}`}
        language={language}
        may={may}
        propertyId={propertyId}
      />
    );
  }
  return (
    <>
      <PageHead
        active={active}
        sub={<p className="ui-sub">{t(language, "sub")}</p>}
      />
      {propertyId !== "" && (
        <JointInspectionsList
          active={active}
          api={api}
          language={language}
          propertyId={propertyId}
        />
      )}
      <section aria-labelledby="inspections-soon" className="ui-card">
        <h2 id="inspections-soon">{t(language, "soon_t")}</h2>
        <p className="ui-notice info" role="note">
          <Icon name="info" />
          <span>{t(language, "soon")}</span>
        </p>
        <ul className="ui-plain ui-insp-list">
          <li>
            <span>{t(language, "moveout")}</span>
            <a className="ui-btn" href={hashForPage("moveout")}>
              {t(language, "moveout_open")}
            </a>
          </li>
          <li>
            <span>{t(language, "checks")}</span>
            <a className="ui-btn" href={hashForPage("problems")}>
              {t(language, "checks_open")}
            </a>
          </li>
        </ul>
      </section>
    </>
  );
}
