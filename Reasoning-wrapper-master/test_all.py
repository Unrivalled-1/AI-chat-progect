def test():
    agents = [{'name': 'Planner', 'inputs': []}, {'name': '1', 'inputs': [0]}, {'name': '2', 'inputs': [0]}, {'name': '3', 'inputs': [0]}, {'name': '4', 'inputs': [0]}, {'name': 'Writer', 'inputs': [1,2,3,4]}]
    actual_skipped = {3} # Subagent 3 is skipped
    for i, a in enumerate(agents):
        inputs = a.get("inputs", [])
        if inputs and all(idx in actual_skipped for idx in inputs if 0 <= idx < len(agents)):
            print(f"Agent {i} ({a['name']}) IS SKIPPED!")
        else:
            print(f"Agent {i} ({a['name']}) RUNS")

test()
