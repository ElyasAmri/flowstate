# Presentation script

Greetings everyone, my name is Osama, and this is my colleague Elyas. Today we are presenting our work.

Before we started, we asked ourselves one question: why aren't LLM agents integrated into the work of institutions and government. One technical issue is reliability. Us humans tend to rely on others doing work correctly and be held accountable when done incorrectly. Agents are not only unreliable on certain tasks, they are also inconsistent when repeating the task on the same input.

Coming from a software engineering background, this problem is easily attributable to one reason: agent have too many responsibilities. We hand agents too many tools, too many tasks, and expect to do wonders. But the truth is that most work, if not all, follows a certain ordering or steps. So the question is, can we model separation of concerns on the agents and coordinate them to achieve more consistent and potentially reliable output? And this is where Flowstate comes into the picture.

Flowstate is an agent-driven program, inspired by claude code and n8n. It has an editor which allows users to create a workflow to handle input through outside sources (channels), funnel input through multiple steps which of code, agents, external service, and nested flows, and at certain steps asks for intervention from a human worker or send messages to other channels. All of this is run in a single harness, which allows for maximum control over each step.

Fanar serves two main roles in this program: agentic LLM for tool calling, and document parsing (image, text, audio etc.) Its capability to better extract info from Arabic context is a perfect suit for this.

Now this is good and all, but we wanted to show its effectiveness. We pulled a bunch of datasets that deals with procedures and routines. For this demo, we present results from a road traffic dataset and an Arabic Legal Judgement Dataset. Results are presented on screen. As you can see, Fanar running on a single RunPod instance is slightly under frontier models from silicon valley.

This has been a presentation by team return 0; thank you.
