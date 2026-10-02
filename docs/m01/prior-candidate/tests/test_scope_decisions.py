import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ScopeDecisionAcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.record = json.loads(
            (ROOT / "docs" / "M01-T01-decisions.json").read_text()
        )

    def test_every_build_blocker_has_an_accountable_role_and_delivery_effect(self):
        decisions = self.record["decisions"]
        self.assertEqual(len({item["id"] for item in decisions}), len(decisions))
        self.assertEqual(
            {item["topic"] for item in decisions},
            {
                "countries", "cargo", "scale", "hosting", "availability",
                "routing", "erp", "team",
            },
        )
        expected_sources = {
            "countries": "D01", "cargo": "D01", "scale": "D02",
            "availability": "D02", "routing": "D03", "erp": "D03",
            "team": "D04", "hosting": "SCOPE-04",
        }
        for decision in decisions:
            with self.subTest(topic=decision["topic"]):
                self.assertEqual(
                    decision["source"], expected_sources[decision["topic"]]
                )
                for field in ("question", "delivery_effect", "required_evidence"):
                    self.assertTrue(decision[field].strip())
                self.assertTrue(decision["owner"]["accountable_role"].strip())
                self.assertEqual(decision["owner"]["assignment_status"], "proposed")
                self.assertIsNone(decision["owner"]["person"])
                self.assertEqual(decision["status"], "open")

    def test_scale_and_operating_decisions_cover_the_supplied_unknowns(self):
        decisions = {item["topic"]: item for item in self.record["decisions"]}
        required_inputs = {
            "countries": {"countries", "driver_rules", "compliance_evidence"},
            "cargo": {"cargo_types", "restrictions"},
            "scale": {
                "depots", "fleet", "daily_jobs", "concurrent_users", "devices",
            },
            "hosting": {"hosting_model", "data_residency"},
            "availability": {"availability_target", "rto", "rpo"},
            "routing": {"coverage", "road_suitability"},
            "erp": {"initial_adapters", "field_ownership"},
        }
        for topic, fields in required_inputs.items():
            self.assertLessEqual(fields, set(decisions[topic]["inputs"]))

    def test_scope_keeps_freight_and_future_passenger_models_separate(self):
        scope = self.record["scope"]
        self.assertEqual(
            set(scope["freight_workflows"]),
            {"collections", "deliveries", "transfers", "returns", "multi_leg"},
        )
        self.assertEqual(
            scope["lifecycle"],
            [
                "quotation", "booking", "validation", "planning", "dispatch",
                "execution", "proof_of_delivery", "billing", "reconciliation",
            ],
        )
        self.assertEqual(
            set(scope["independent_states"]), {"operational", "delivery", "financial"}
        )
        extension = scope["extension"]
        self.assertEqual(
            set(extension["shared_primitives"]),
            {"tasks", "stops", "resources", "schedules", "capacity"},
        )
        self.assertEqual(
            set(extension["passenger_owned_fields"]),
            {"seats", "boarding", "accessibility"},
        )
        self.assertTrue(extension["freight_owned_fields"])
        self.assertFalse(
            set(extension["freight_owned_fields"])
            & set(extension["passenger_owned_fields"])
        )
        self.assertFalse(extension["requires_existing_freight_record_changes"])
        self.assertFalse(extension["passenger_in_initial_scope"])
        self.assertEqual(
            set(scope["ownership_boundaries"]), {"tenant", "customer", "subcontractor"}
        )

    def test_generated_candidate_does_not_claim_business_approval(self):
        self.assertEqual(self.record["task"], "M01-T01")
        self.assertEqual(self.record["status"], "candidate_for_review")
        self.assertEqual(self.record["repository"]["status"], "confirmed_in_context")
        for subject in ("freight_scope", "mixed_transport_extension"):
            approval = self.record["approvals"][subject]
            self.assertEqual(approval["status"], "pending")
            self.assertTrue(approval["requested_role"])
            self.assertIsNone(approval["approved_by"])
            self.assertIsNone(approval["evidence"])
        self.assertFalse(self.record["acceptance_complete"])


if __name__ == "__main__":
    unittest.main()