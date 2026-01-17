import json
import os

CONFIG_FILE = "session_config.json"

def main():
    print("--- OpsInsight Admin Wizard ---")
    print("Configure the Autonomous Interview Agent\n")

    process_name = input("Target Process Name (e.g., 'Invoice Approval'): ").strip()
    if not process_name: process_name = "General Process"

    objective = input("Key Objective (e.g., 'Identify bottlenecks'): ").strip()
    if not objective: objective = "Map the workflow"

    print("\nSelect Interview Tone:")
    print("1. Formal Auditor (Strict, precise)")
    print("2. Helpful Colleague (Casual, investigative)")
    print("3. Neutral Consultant (Balanced, standard)")
    
    tone_choice = input("Choice [3]: ").strip()
    
    tone_map = {
        "1": "Formal Auditor: Professional, slightly skeptical, focused on compliance and metrics.",
        "2": "Helpful Colleague: Casual, friendly, 'we're in this together' vibe, but still digging for truth.",
        "3": "Expert Operations Consultant: Neutral, analytical, rigorous, and professional."
    }
    
    selected_tone = tone_map.get(tone_choice, tone_map["3"])

    config = {
        "process_name": process_name,
        "objective": objective,
        "persona_tone": selected_tone
    }

    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

    print(f"\n[Success] Configuration saved to {CONFIG_FILE}")
    print("You can now run 'python interviewer.py' to start the agent.")

if __name__ == "__main__":
    main()
