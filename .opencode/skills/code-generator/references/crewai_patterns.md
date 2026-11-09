# CrewAI Code Patterns Reference

This file provides authoritative code templates for generating CrewAI projects.
Always use these patterns as the baseline — adapt names and logic to the design document.

---

## Table of Contents
1. Single Crew Pattern
2. Multi-Crew with Flow Pattern
3. Agent and Task YAML config
4. Tools integration
5. LLM configuration

---

## 1. Single Crew Pattern

### `crew.py`
```python
from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task
from crewai_tools import SerperDevTool  # add/remove tools as needed


@CrewBase
class ResearchCrew:
    """Research crew for gathering and analyzing information."""

    agents_config = "config/agents.yaml"
    tasks_config = "config/tasks.yaml"

    @agent
    def researcher(self) -> Agent:
        return Agent(
            config=self.agents_config["researcher"],
            verbose=True,
        )

    @agent
    def analyst(self) -> Agent:
        return Agent(
            config=self.agents_config["analyst"],
            verbose=True,
        )

    @task
    def research_task(self) -> Task:
        return Task(
            config=self.tasks_config["research_task"],
        )

    @task
    def analysis_task(self) -> Task:
        return Task(
            config=self.tasks_config["analysis_task"],
        )

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,    # auto-collected from @agent methods
            tasks=self.tasks,      # auto-collected from @task methods
            process=Process.sequential,
            verbose=True,
        )
```

### `main.py` (single crew)
```python
from dotenv import load_dotenv
from src.my_project.crew import ResearchCrew

load_dotenv()


def run(inputs: dict) -> str:
    """Entry point to run the crew."""
    result = ResearchCrew().crew().kickoff(inputs=inputs)
    return result.raw


if __name__ == "__main__":
    result = run(inputs={"topic": "AI trends in 2025"})
    print(result)
```

---

## 2. Multi-Crew with Flow Pattern

Use this when the design document describes multiple distinct teams, pipelines, or processing stages.

### `flow.py`
```python
from crewai.flow.flow import Flow, listen, router, start
from pydantic import BaseModel

from src.my_project.crews.research_crew.crew import ResearchCrew
from src.my_project.crews.analysis_crew.crew import AnalysisCrew
from src.my_project.crews.reporting_crew.crew import ReportingCrew


class ProjectState(BaseModel):
    """Shared state passed between crews throughout the flow."""
    topic: str = ""
    research_findings: str = ""
    analysis_results: str = ""
    final_report: str = ""
    research_quality: str = "low"   # used for routing decisions


class ProjectFlow(Flow[ProjectState]):
    """
    Orchestrates multiple crews in sequence.

    Flow:
      1. research_step    — gathers raw information
      2. quality_router   — routes to analysis or re-research based on quality
      3. analysis_step    — synthesizes findings
      4. reporting_step   — produces final deliverable
    """

    @start()
    def research_step(self) -> None:
        """Kick off the Research Crew to gather raw findings."""
        result = ResearchCrew().crew().kickoff(
            inputs={"topic": self.state.topic}
        )
        self.state.research_findings = result.raw
        # Simple heuristic: if output is long enough, treat as high quality
        self.state.research_quality = (
            "high" if len(result.raw) > 500 else "low"
        )

    @router(research_step)
    def quality_router(self) -> str:
        """Route based on research quality."""
        if self.state.research_quality == "high":
            return "proceed_to_analysis"
        return "retry_research"

    @listen("retry_research")
    def retry_research_step(self) -> None:
        """Retry research with a more focused prompt."""
        result = ResearchCrew().crew().kickoff(
            inputs={"topic": f"detailed deep-dive: {self.state.topic}"}
        )
        self.state.research_findings = result.raw

    @listen("proceed_to_analysis")
    @listen(retry_research_step)
    def analysis_step(self) -> None:
        """Run the Analysis Crew on gathered research."""
        result = AnalysisCrew().crew().kickoff(
            inputs={"research_data": self.state.research_findings}
        )
        self.state.analysis_results = result.raw

    @listen(analysis_step)
    def reporting_step(self) -> None:
        """Run the Reporting Crew to produce the final output."""
        result = ReportingCrew().crew().kickoff(
            inputs={
                "analysis": self.state.analysis_results,
                "topic": self.state.topic,
            }
        )
        self.state.final_report = result.raw


### `main.py` (multi-crew with Flow)
```python
from dotenv import load_dotenv
from src.my_project.flow import ProjectFlow

load_dotenv()


def run(topic: str) -> str:
    """Entry point: creates and runs the project flow."""
    flow = ProjectFlow()
    flow.kickoff(inputs={"topic": topic})
    return flow.state.final_report


if __name__ == "__main__":
    result = run(topic="The impact of AI on supply chain management")
    print(result)
```

---

## 3. Agent and Task YAML Config

### `config/agents.yaml`
```yaml
researcher:
  role: >
    Senior Research Specialist
  goal: >
    Conduct thorough, accurate research on {topic} and surface
    the most relevant and credible information available.
  backstory: >
    You are an expert researcher with 15 years of experience in
    information gathering and synthesis. You excel at finding
    authoritative sources and distilling complex topics.

analyst:
  role: >
    Data Analyst and Strategist
  goal: >
    Analyze research findings and identify key patterns,
    insights, and strategic implications.
  backstory: >
    You are a strategic analyst who turns raw information into
    actionable insights. You have a talent for seeing patterns
    others miss and communicating findings clearly.
```

### `config/tasks.yaml`
```yaml
research_task:
  description: >
    Research the topic: {topic}

    Gather comprehensive information from reliable sources.
    Focus on:
    - Key facts and current state of the topic
    - Recent developments and trends
    - Important stakeholders or entities involved
    - Any controversies or debates

    Produce a detailed research report with all findings clearly documented.
  expected_output: >
    A detailed research report (minimum 500 words) covering the topic
    thoroughly, with all key findings organized by theme, and sources
    noted where relevant.
  agent: researcher

analysis_task:
  description: >
    Analyze the research findings provided and produce a strategic analysis.

    Research data:
    {research_data}

    Your analysis should:
    - Identify the 3-5 most important insights
    - Highlight any risks or opportunities
    - Provide a clear narrative connecting the findings
  expected_output: >
    A structured analysis document with: executive summary, key insights
    (numbered list), opportunities, risks, and recommended next steps.
  agent: analyst
  context:
    - research_task
```

---

## 4. Tools Integration

Add tools to specific agents. Only add tools that are relevant to what that agent needs to do.

```python
from crewai_tools import (
    SerperDevTool,        # Web search
    FileReadTool,         # Read local files
    WebsiteSearchTool,    # Search a specific website
    CSVSearchTool,        # Search CSV files
)

@agent
def researcher(self) -> Agent:
    return Agent(
        config=self.agents_config["researcher"],
        tools=[SerperDevTool(), WebsiteSearchTool()],
        verbose=True,
    )
```

---

## 5. LLM Configuration

CrewAI respects standard environment variables for LLM selection.
Generate a `config.py` so users can easily switch providers:

```python
# config.py
import os
from crewai import LLM

def get_llm() -> LLM:
    """
    Returns the configured LLM based on environment variables.
    Set LLM_PROVIDER to one of: openai, anthropic, azure
    """
    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    model = os.getenv("LLM_MODEL", "gpt-4o")

    if provider == "openai":
        return LLM(model=model, api_key=os.getenv("OPENAI_API_KEY"))
    elif provider == "anthropic":
        return LLM(
            model=os.getenv("LLM_MODEL", "claude-3-5-sonnet-20241022"),
            api_key=os.getenv("ANTHROPIC_API_KEY"),
        )
    elif provider == "azure":
        return LLM(
            model=f"azure/{model}",
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            base_url=os.getenv("AZURE_OPENAI_ENDPOINT"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01"),
        )
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")
```

Then pass to agents:
```python
from src.my_project.config import get_llm

@agent
def researcher(self) -> Agent:
    return Agent(
        config=self.agents_config["researcher"],
        llm=get_llm(),
        verbose=True,
    )
```

---

## Key CrewAI Best Practices

1. **Use YAML configs** for agents and tasks — keeps the Python code clean and makes it easy to tweak prompts without touching code.

2. **One responsibility per agent** — each agent should have a single, well-defined role. Avoid "do-everything" agents.

3. **Tasks should specify `expected_output`** — this guides the agent to produce the right format and length.

4. **Use `context` in tasks** to chain task outputs — a task can reference prior tasks' outputs by listing them under `context`.

5. **Flows for orchestration logic** — put conditional logic, retries, and multi-crew routing in the Flow, not inside crews.

6. **Pydantic state models** — always use a typed Pydantic model for Flow state. This makes debugging easy and prevents state pollution.

7. **`Process.sequential` for most cases** — use `Process.hierarchical` only when a manager agent needs to dynamically assign subtasks.

8. **verbose=True during development** — helps trace what agents are doing; turn off in production to reduce noise.
