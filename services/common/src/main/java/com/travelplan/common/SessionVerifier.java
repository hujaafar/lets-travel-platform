package com.travelplan.common;

public interface SessionVerifier {
  SessionUser verify(String token);
}
