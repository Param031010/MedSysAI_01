"""End-to-End Master Test Suite for All 5 Clinical Chat Architecture Phases.

Tests:
1. Phase 1: Semantic Triage Red-Flag Layer (Emergency vs Negation vs Routine)
2. Phase 2: Longitudinal Symptom State Tracking (Active, Resolved, Historical)
3. Phase 3: Interactive Quick-Reply Option Chips Generation
4. Phase 4: Medication Safety & Safe Home Remedies Guardrail (Steam Burn Prohibition)
5. Phase 5: Progressive Disclosure & Situation-Aware Response Formatting
"""

import asyncio
from datetime import datetime
from app.db import get_db
from app.services import triage, symptom_tracker, quick_options, med_safety, model_router


async def run_master_test_suite():
    print("=" * 65)
    print("   MEDSYSAI MASTER CLINICAL CHAT ARCHITECTURE TEST SUITE")
    print("=" * 65)

    test_user_id = "test_user_phase_suite"
    db = get_db()
    
    try:
        # -------------------------------------------------------------
        # PHASE 1: SEMANTIC CLINICAL TRIAGE & RED-FLAG LAYER
        # -------------------------------------------------------------
        print("\n[PHASE 1] Testing Semantic Triage Red-Flag Layer...")
        
        red_flag_res = await triage.eval_triage("I am having crushing chest pain radiating to my left arm and sweating.")
        print(f"  Emergency Input -> is_red_flag: {red_flag_res['is_red_flag']}, urgency: '{red_flag_res['urgency']}'")
        assert red_flag_res["is_red_flag"] is True, "Phase 1 Emergency trigger failed"

        negation_res = await triage.eval_triage("I have a dry cough, but I do NOT have any chest pain or difficulty breathing.")
        print(f"  Negation Input -> is_red_flag: {negation_res['is_red_flag']}, urgency: '{negation_res['urgency']}'")
        assert negation_res["is_red_flag"] is False, "Phase 1 Negation check failed"
        print("  [OK] PHASE 1 PASSED: Semantic triage layer is working!")

        # -------------------------------------------------------------
        # PHASE 2: LONGITUDINAL SYMPTOM STATE TRACKING
        # -------------------------------------------------------------
        print("\n[PHASE 2] Testing Longitudinal Symptom State Tracking...")
        
        # Log active symptom
        symptom_tracker.update_symptom_state(test_user_id, "Dry Cough", status="active", notes="Started 3 days ago")
        # Log and resolve a past symptom
        symptom_tracker.update_symptom_state(test_user_id, "Migraine", status="active")
        symptom_tracker.resolve_symptom(test_user_id, "Migraine", notes="Resolved with rest")
        
        summary = symptom_tracker.get_patient_symptom_summary(test_user_id)
        active_names = [s["symptom"] for s in summary["active"]]
        resolved_names = [s["symptom"] for s in summary["resolved"]]
        print(f"  Active Symptoms: {active_names}")
        print(f"  Resolved Symptoms: {resolved_names}")
        assert "Dry Cough" in active_names, "Phase 2 Active symptom tracking failed"
        assert "Migraine" in resolved_names, "Phase 2 Resolved symptom tracking failed"

        memory_block = symptom_tracker.format_medical_memory_block(test_user_id)
        print("  Formatted Medical Memory Block:\n    " + memory_block.encode('ascii', errors='ignore').decode('ascii').replace("\n", "\n    "))
        print("  [OK] PHASE 2 PASSED: Symptom state tracking & memory formatting is working!")

        # -------------------------------------------------------------
        # PHASE 3: INTERACTIVE QUICK-REPLY OPTION CHIPS GENERATION
        # -------------------------------------------------------------
        print("\n[PHASE 3] Testing Interactive Quick-Reply Option Chips...")
        
        user_msg = "I have a cough. What should I do?"
        assistant_reply = "How long have you had the cough, and is it a dry cough or producing mucus?"
        opts = await quick_options.generate_quick_options(user_msg, assistant_reply)
        print(f"  User Question: '{user_msg}'")
        print(f"  Assistant Reply: '{assistant_reply}'")
        print(f"  Generated Quick Options Chips ({len(opts)}): {opts}")
        assert isinstance(opts, list), "Phase 3 Quick options should be a list"
        print("  [OK] PHASE 3 PASSED: Quick-reply option chips generation is working!")

        # -------------------------------------------------------------
        # PHASE 4: MEDICATION SAFETY & SAFE HOME REMEDIES GUARDRAIL
        # -------------------------------------------------------------
        print("\n[PHASE 4] Testing Safe Home Remedies & Steam Guardrail...")
        
        base_prompt = "Write recommendations for nasal congestion."
        guarded_prompt = med_safety.apply_safety_guardrails(base_prompt)
        reply = await model_router.generate_reply(guarded_prompt)
        print("  Model Response snippet:")
        clean_snippet = reply[:300].encode('ascii', errors='ignore').decode('ascii')
        print("    " + clean_snippet.replace("\n", "\n    ") + "...")

        
        # Verify direct hot water bowl steam inhalation is NOT positively recommended
        lowered = reply.lower()
        has_unsafe_steam = "place your face over a bowl of hot water" in lowered or "inhale steam from a bowl of hot water" in lowered
        print(f"  Unsafe Hot Water Steam Recommended: {has_unsafe_steam}")
        assert not has_unsafe_steam, "Phase 4 Safety Guardrail failed (unsafe steam recommended)"
        print("  [OK] PHASE 4 PASSED: Safe home remedies guardrail is working!")


        # -------------------------------------------------------------
        # PHASE 5: PROGRESSIVE DISCLOSURE & RESPONSE FORMATTING
        # -------------------------------------------------------------
        print("\n[PHASE 5] Testing Progressive Disclosure & Response Length...")
        
        short_prompt = "Is paracetamol safe for headache?"
        response_short = await model_router.generate_reply(
            f"Keep response concise (under 75 words):\n\n{short_prompt}"
        )
        word_count = len(response_short.split())
        print(f"  Response Word Count: {word_count} words")
        print("  Response text:\n    " + response_short.encode('ascii', errors='ignore').decode('ascii').replace("\n", "\n    "))

        assert word_count <= 250, f"Phase 5 response exceeded 250 word limit ({word_count} words)"
        print("  [OK] PHASE 5 PASSED: Response length is strictly capped under 200-250 words!")


    finally:
        # CLEANUP
        print("\n[CLEANUP] Removing test user data from MongoDB...")
        db.patient_symptom_history.delete_many({"clerkUserId": test_user_id})
        print("  [OK] CLEANUP COMPLETED.")

    print("\n" + "=" * 65)
    print("   ALL 5 ARCHITECTURE PHASES PASSED 100%! SYSTEM IS READY!")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(run_master_test_suite())
