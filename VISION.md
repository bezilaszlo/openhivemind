# Open Hivemind

A team's shared memory of how its work with coding agents actually happened.

## Why

Every developer's agent sessions live only on their own machine. What they
contain is lost to the team: what was tried, what failed, why a decision was
made, what the agent really verified. Open Hivemind keeps that history where
the team owns it and makes it searchable, by people and by agents.

Three things it is for:

1. **Recall.** Did we already try this? Why is it done this way?
2. **Continuity.** Your own reasoning, from before the context was lost or from
   a machine you are not sitting at.
3. **Understanding.** A diff shows a result. The session shows intent, context,
   dead ends and the moment a decision went wrong. That is how a team improves
   the way it works with agents, not just the code they produce.

Over time this becomes the team's knowledge and decision record, written by the
people driving the agents, across every harness they use.

## Principles

- **The team owns its data.** Self-hosted first. Anyone can run it, for free.
- **Simple to operate.** As little infrastructure as the job allows.
- **Secrets stay on the laptop.** Nothing leaves a machine unscrubbed, and what
  is never needed is never sent.
- **Recall, not surveillance.** It exists to find work, not to measure people.
- **The developer stays in control.** They choose which folders are captured
  and can withdraw any session of their own, at any time, no admin needed.
- **Built for agents as much as for humans.** Whatever an agent reads back must
  be bounded and composable.
- **Open.** MIT, decisions recorded in the repo.
