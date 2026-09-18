# Aldus Palace — planning vocabulary

The shared product language for a system that turns user intent into structured, explainable, and adaptable support.

## Planning

**主动续排**:
The user explicitly schedules another commitment for today after receiving a rest suggestion, including a new input that clearly says it should be done today. Merely capturing unscheduled work is not an active continuation.
_Avoid_: 继续添加任务, 新增任务

**自动续排上限**:
The number of commitments completed today at which the system stops adding more work and suggests rest. It is 5 by default and becomes 10 for that same day after an active continuation.
_Avoid_: 超过 5 个后, 第 6 个才停止

**自适应规划画像**:
Internal, reversible planning state inferred from recent work behavior and used to tune low-risk scheduling parameters without confirmation. It is not a declarative long-term Memory and does not appear in the Memory UI.
_Avoid_: 记忆偏好, 永久工作人格

**休息建议**:
A once-per-threshold, non-blocking tip shown when the automatic continuation limit is reached. It does not prevent the user from scheduling or completing more commitments.
_Avoid_: 工作限制, 强制休息

**续排暂停**:
A reversible state in which automatic additions stop because the same Today queue of one to three commitments produced no completion for 24 hours. One long-running item does not cause the pause when another item in that queue was completed; completing three distinct commitments in a rolling 24-hour window resumes automatic additions.
_Avoid_: 任务逾期, 单项超时

**先不做**:
The user removes a commitment's current Today arrangement and returns it to unscheduled work without completing, cancelling, or deleting the commitment. Its deadline remains authoritative, so a commitment due today may still appear as a risk.
_Avoid_: 稍后, 取消任务, 删除任务

**安排来源**:
The provenance of a Today arrangement: either explicitly arranged by the user or suggested by the agent. The same “先不做” action is plan revision for a user arrangement and recommendation feedback for an agent arrangement.
_Avoid_: 任务来源, 创建来源

**选择结果观察期**:
A rolling 24-hour episode opened when the user chooses “先不做” and closed by the next meaningful planning or work action. Consecutive removals belong to one episode; no meaningful action before expiry is classified as stopping work.
_Avoid_: 单次拒绝, 用户不喜欢这个任务

**规划经验**:
A decaying behavioral pattern formed when the same selection outcome occurs at least three times within a rolling 15-day window. It may tune future candidate ranking but cannot override deadlines, risks, or explicit user arrangements.
_Avoid_: 长期 Memory, 永久偏好, 单次反馈
