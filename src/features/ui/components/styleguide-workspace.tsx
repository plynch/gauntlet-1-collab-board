"use client";

import { useState } from "react";

import { Badge } from "@/features/ui/components/badge";
import { Button } from "@/features/ui/components/button";
import {
  Card,
  CardDescription,
  CardTitle,
} from "@/features/ui/components/card";
import { GridContainer } from "@/features/ui/components/grid-container";
import { Input } from "@/features/ui/components/input";
import { SectionHeading } from "@/features/ui/components/section-heading";

export function StyleguideWorkspace() {
  const [sampleText, setSampleText] = useState("Sprint planning");

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="space-y-3">
          <Badge tone="success">Component Library</Badge>
          <h1 className="m-0 text-3xl font-bold tracking-tight">
            CollabBoard Style Guide
          </h1>
          <p className="m-0 max-w-3xl text-sm text-slate-600">
            Minimal, calmly reassuring UI primitives and board-specific layout
            components.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-3">
            <CardTitle>Buttons</CardTitle>
            <CardDescription>
              Core action styles for board and settings UI.
            </CardDescription>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="success">Success</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="danger">Danger</Button>
            </div>
          </Card>

          <Card className="space-y-3">
            <CardTitle>Inputs</CardTitle>
            <CardDescription>
              Clean forms with low visual noise.
            </CardDescription>
            <Input
              value={sampleText}
              onChange={(event) => setSampleText(event.target.value)}
              placeholder="Type board title"
            />
          </Card>
        </section>

        <section className="space-y-4">
          <SectionHeading>Grid Containers</SectionHeading>
          <p className="m-0 text-sm text-slate-600">
            These containers support 1x1, 2x2, and NxN layouts with intentional
            negative space for additional board objects.
          </p>

          <div className="grid gap-6">
            <Card className="space-y-3">
              <CardTitle>1x1 Container</CardTitle>
              <GridContainer
                rows={1}
                cols={1}
                minCellHeight={140}
                containerTitle="One Section"
              />
            </Card>

            <Card className="space-y-3">
              <CardTitle>2x2 SWOT-Ready Container</CardTitle>
              <GridContainer
                rows={2}
                cols={2}
                minCellHeight={120}
                containerTitle="SWOT Analysis"
                sectionTitles={[
                  "Strengths",
                  "Weaknesses",
                  "Opportunities",
                  "Threats",
                ]}
                showSectionStickyNotes
              />
            </Card>

            <Card className="space-y-3">
              <CardTitle>3x3 Container with Per-Cell Color Pickers</CardTitle>
              <GridContainer
                rows={3}
                cols={3}
                minCellHeight={96}
                containerTitle="Planning Matrix"
                showCellColorPickers
                showSectionStickyNotes
              />
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
