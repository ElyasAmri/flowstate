# Example flows

Three real Flowstate flows that encode the evaluation loop (see the repo
[README](../README.md) section 5 and [demo.md](../demo.md)). Each is a
`FlowDefinition` in the exact on-disk shape the app loads; the channels they
reference are in [`flows/channels/`](flows/channels). All three compile through
the actual compiler (`app/src/lib/flow/compile.ts`) with zero errors.

| Flow | Kind | What it does |
| --- | --- | --- |
| [`flow-drafting`](flows/flow-drafting.json) | meta-flow | event-log door → agent mines the model → agent drafts a flow → writes it to the flow library |
| [`fine-management-routine`](flows/fine-management-routine.json) | major flow | deterministic spine (create → notify → pay, or unpaid → penalty → credit collection); contested fines fork to an agent assessment and a prefecture human gate |
| [`flow-update`](flows/flow-update.json) | meta-flow | exception-batch door → shell aggregation → agent proposes updates → policy-maker human gate → writes the approved update back |

Together they close the loop: `flow-drafting` authors the routine flow,
`fine-management-routine` runs it (routine cases deterministically, exceptions to
the human gate), and `flow-update` turns the accumulated exceptions back into a
proposed update to the routine flow.

## Regenerate / verify

```bash
python3 eval/build_flows.py     # author + structural validation
bash    demo/run_demo.sh        # full loop incl. real-compiler check
```

## Open in the app

Copy the artifacts into the project directory the app runs against:

```bash
bash demo/run_demo.sh --load /path/to/project
# or manually:
cp examples/flows/*.json          /path/to/project/.flowstate/flows/
cp examples/flows/channels/*.json /path/to/project/.flowstate/channels/
```

Then launch the app against that project and open the flows from the Flows list.
