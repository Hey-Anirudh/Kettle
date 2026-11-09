# GenAI Direct LLM API Patterns Reference

This file provides code templates for generating GenAI projects that use
direct LLM API calls (non-agentic). Use these patterns when the user says
the solution is GenAI-based (not agentic).

---

## Table of Contents
1. Project config pattern
2. Core LLM caller module
3. Chain / pipeline pattern
4. Streaming pattern
5. RAG (Retrieval-Augmented Generation) pattern
6. Requirements and .env

---

## 1. Project Config Pattern

Always generate a `config.py` that centralizes the LLM provider setup.
This makes it trivial for the user to swap providers.

```python
# src/<project_name>/config.py
import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass
class LLMConfig:
    """Central LLM configuration. Set LLM_PROVIDER in your .env file."""
    provider: str = os.getenv("LLM_PROVIDER", "openai")
    model: str = os.getenv("LLM_MODEL", "gpt-4o")
    temperature: float = float(os.getenv("LLM_TEMPERATURE", "0.7"))
    max_tokens: int = int(os.getenv("LLM_MAX_TOKENS", "2048"))

    # OpenAI / Azure
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    azure_api_key: str = os.getenv("AZURE_OPENAI_API_KEY", "")
    azure_endpoint: str = os.getenv("AZURE_OPENAI_ENDPOINT", "")
    azure_api_version: str = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01")
    azure_deployment: str = os.getenv("AZURE_OPENAI_DEPLOYMENT", "")

    # Anthropic
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")


# Singleton config instance
config = LLMConfig()
```

---

## 2. Core LLM Caller Module

Generate a single `llm_client.py` that abstracts provider differences.
All other modules import from this, so switching providers requires
only changing the `.env` file.

```python
# src/<project_name>/llm_client.py
from typing import Optional
from src.my_project.config import config


def get_client():
    """Returns the appropriate LLM client based on LLM_PROVIDER env var."""
    if config.provider == "openai":
        from openai import OpenAI
        return OpenAI(api_key=config.openai_api_key)

    elif config.provider == "azure":
        from openai import AzureOpenAI
        return AzureOpenAI(
            api_key=config.azure_api_key,
            azure_endpoint=config.azure_endpoint,
            api_version=config.azure_api_version,
        )

    elif config.provider == "anthropic":
        import anthropic
        return anthropic.Anthropic(api_key=config.anthropic_api_key)

    else:
        raise ValueError(f"Unsupported LLM provider: {config.provider}")


def call_llm(
    prompt: str,
    system_prompt: Optional[str] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
) -> str:
    """
    Make a single LLM call and return the response text.

    Args:
        prompt: The user message / main prompt
        system_prompt: Optional system-level instruction
        temperature: Override the default temperature (from config)
        max_tokens: Override the default max_tokens (from config)

    Returns:
        The LLM's response as a string
    """
    temp = temperature if temperature is not None else config.temperature
    tokens = max_tokens if max_tokens is not None else config.max_tokens
    client = get_client()

    if config.provider in ("openai", "azure"):
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        model = config.azure_deployment if config.provider == "azure" else config.model

        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temp,
            max_tokens=tokens,
        )
        return response.choices[0].message.content

    elif config.provider == "anthropic":
        kwargs = {
            "model": config.model,
            "max_tokens": tokens,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temp,
        }
        if system_prompt:
            kwargs["system"] = system_prompt
        response = client.messages.create(**kwargs)
        return response.content[0].text

    else:
        raise ValueError(f"Unsupported provider: {config.provider}")
```

---

## 3. Chain / Pipeline Pattern

When the design document describes a multi-step pipeline (e.g., extract → summarize → classify),
generate each step as a function and compose them.

```python
# src/<project_name>/pipeline.py
from src.my_project.llm_client import call_llm


EXTRACTION_SYSTEM = """You are an expert at extracting structured information
from unstructured text. Always respond in the format requested."""

SUMMARY_SYSTEM = """You are a concise summarizer. Produce clear, accurate
summaries without losing key information."""

CLASSIFICATION_SYSTEM = """You are a classification specialist. Assign the
correct category based on the content provided."""


def extract_information(raw_text: str) -> str:
    """Step 1: Extract key entities and facts from raw text."""
    prompt = f"""Extract the following from this text:
- Main topic
- Key entities (people, organizations, locations)
- Core claims or findings
- Any numerical data

Text:
{raw_text}

Respond in structured bullet-point format."""
    return call_llm(prompt, system_prompt=EXTRACTION_SYSTEM)


def summarize(extracted_info: str) -> str:
    """Step 2: Produce a concise summary from extracted information."""
    prompt = f"""Summarize the following extracted information in 3-5 sentences:

{extracted_info}"""
    return call_llm(prompt, system_prompt=SUMMARY_SYSTEM, temperature=0.3)


def classify(summary: str, categories: list[str]) -> str:
    """Step 3: Classify content into one of the provided categories."""
    categories_str = "\n".join(f"- {c}" for c in categories)
    prompt = f"""Classify the following into exactly one category.

Categories:
{categories_str}

Content:
{summary}

Respond with only the category name, nothing else."""
    return call_llm(prompt, system_prompt=CLASSIFICATION_SYSTEM, temperature=0.0)


def run_pipeline(raw_text: str, categories: list[str]) -> dict:
    """Run the full extraction → summary → classification pipeline."""
    extracted = extract_information(raw_text)
    summary = summarize(extracted)
    category = classify(summary, categories)
    return {
        "extracted": extracted,
        "summary": summary,
        "category": category,
    }
```

---

## 4. Streaming Pattern

Use this when the design document calls for real-time output (e.g., chatbots, live generation).

```python
# src/<project_name>/streaming.py
from typing import Generator
from src.my_project.config import config
from src.my_project.llm_client import get_client


def stream_llm(prompt: str, system_prompt: str = "") -> Generator[str, None, None]:
    """
    Stream LLM output token-by-token.
    Yields each text chunk as it arrives.
    """
    client = get_client()

    if config.provider in ("openai", "azure"):
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        model = config.azure_deployment if config.provider == "azure" else config.model

        with client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
        ) as stream:
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

    elif config.provider == "anthropic":
        kwargs = {
            "model": config.model,
            "max_tokens": config.max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        with client.messages.stream(**kwargs) as stream:
            for text in stream.text_stream:
                yield text
```

---

## 5. RAG Pattern (Retrieval-Augmented Generation)

Use when the design document mentions searching documents, knowledge bases, or context injection.

```python
# src/<project_name>/rag.py
"""
Simple RAG implementation using in-memory vector search (FAISS).
For production, swap the vector store for Pinecone, Chroma, Weaviate, etc.
"""
import os
from typing import List
from src.my_project.llm_client import call_llm


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """Split text into overlapping chunks for indexing."""
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i : i + chunk_size])
        chunks.append(chunk)
    return chunks


def answer_with_context(question: str, context_chunks: List[str]) -> str:
    """Answer a question given retrieved context chunks."""
    context = "\n\n---\n\n".join(context_chunks)
    system_prompt = """You are a helpful assistant that answers questions
based strictly on the provided context. If the context doesn't contain
enough information, say so clearly."""

    prompt = f"""Context:
{context}

Question: {question}

Answer the question based only on the context above."""
    return call_llm(prompt, system_prompt=system_prompt, temperature=0.2)
```

Requirements for RAG: add `faiss-cpu`, `sentence-transformers` to `requirements.txt`.

---

## 6. Standard `main.py` for GenAI

```python
# src/<project_name>/main.py
import sys
from dotenv import load_dotenv
from src.my_project.pipeline import run_pipeline

load_dotenv()


def main():
    """Main entry point."""
    # Example: read input from command line or hardcode for demo
    if len(sys.argv) > 1:
        input_text = " ".join(sys.argv[1:])
    else:
        input_text = "Enter your input text here..."

    categories = ["Technology", "Business", "Science", "Politics", "Other"]

    print("Running pipeline...\n")
    results = run_pipeline(input_text, categories)

    print("=== Extracted Information ===")
    print(results["extracted"])
    print("\n=== Summary ===")
    print(results["summary"])
    print("\n=== Category ===")
    print(results["category"])


if __name__ == "__main__":
    main()
```

---

## Requirements for GenAI projects

### OpenAI / Azure:
```
openai>=1.30.0
python-dotenv>=1.0.0
pydantic>=2.0.0
```

### Anthropic:
```
anthropic>=0.25.0
python-dotenv>=1.0.0
pydantic>=2.0.0
```

### With RAG:
```
openai>=1.30.0
anthropic>=0.25.0
python-dotenv>=1.0.0
pydantic>=2.0.0
faiss-cpu>=1.7.4
sentence-transformers>=2.6.0
```

---

## .env.example for GenAI

```env
# =============================================
# LLM Provider Configuration
# Set LLM_PROVIDER to: openai | azure | anthropic
# =============================================

LLM_PROVIDER=openai
LLM_MODEL=gpt-4o
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=2048

# OpenAI
OPENAI_API_KEY=your_openai_api_key_here

# Azure OpenAI (fill these if LLM_PROVIDER=azure)
AZURE_OPENAI_API_KEY=your_azure_openai_api_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_VERSION=2024-02-01
AZURE_OPENAI_DEPLOYMENT=your_deployment_name_here

# Anthropic (fill this if LLM_PROVIDER=anthropic)
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```
