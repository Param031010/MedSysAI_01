"""Test suite for Phase 1: Semantic Clinical Triage & Red-Flag Layer.

Tests:
1. Emergency Trigger (chest pain + sweating) -> is_red_flag = True
2. Severe Dyspnea Trigger -> is_red_flag = True
3. Negation (cough but NO chest pain) -> is_red_flag = False
4. Third-Party Context (father had stroke) -> is_red_flag = False
5. Routine Symptom (mild runny nose) -> is_red_flag = False
"""

import asyncio
from app.services import triage


async def run_triage_tests():
    print("=" * 60)
    print("      PHASE 1: CLINICAL TRIAGE & RED-FLAG TEST SUITE")
    print("=" * 60)

    test_cases = [
        {
            "name": "Emergency Trigger: Chest Pain & Sweating",
            "input": "I am having severe crushing chest pain and sweating while sitting on my couch.",
            "expect_red_flag": True,
        },
        {
            "name": "Emergency Trigger: Severe Dyspnea & Cyanosis",
            "input": "I can barely breathe and my lips are turning blue.",
            "expect_red_flag": True,
        },
        {
            "name": "Negation Check: Cough with explicitly NO chest pain",
            "input": "I have been coughing for 2 days, but I do NOT have any chest pain or trouble breathing.",
            "expect_red_flag": False,
        },
        {
            "name": "Third-Party Check: Family History",
            "input": "My father suffered severe chest pain last year, so I am asking about heart symptoms.",
            "expect_red_flag": False,
        },
        {
            "name": "Routine Symptom: Mild Common Cold",
            "input": "I have a mild runny nose and occasional sneeze. What warm tea is good?",
            "expect_red_flag": False,
        },
    ]

    all_passed = True

    for i, tc in enumerate(test_cases, 1):
        print(f"\n[CASE {i}] {tc['name']}")
        print(f"  Input: '{tc['input']}'")
        res = await triage.eval_triage(tc["input"])
        is_red_flag = res.get("is_red_flag", False)
        urgency = res.get("urgency", "ROUTINE")
        reason = res.get("red_flag_reason", "")

        print(f"  Result -> is_red_flag: {is_red_flag}, urgency: '{urgency}'")
        if reason:
            print(f"  Reason: {reason}")

        if is_red_flag == tc["expect_red_flag"]:
            print("  [OK] PASSED!")
        else:
            print(f"  [FAIL] FAILED! Expected is_red_flag={tc['expect_red_flag']}, got {is_red_flag}")
            all_passed = False

    print("\n" + "=" * 60)
    if all_passed:
        print("  PHASE 1 TEST SUITE PASSED! TRIAGE LAYER IS WORKING PERFECTLY!")
    else:
        print("  SOME TRIAGE TEST CASES FAILED — CHECK LOGS ABOVE.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_triage_tests())
