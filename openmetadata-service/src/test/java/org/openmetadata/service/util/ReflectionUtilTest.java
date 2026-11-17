package org.openmetadata.service.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class ReflectionUtilTest {

  @Test
  void nullElementsGetPositionKeysWhileNamedElementsKeepTheirNames() {
    List<Object> elements = Arrays.asList(named("alpha"), null, new Object(), named("beta"), null);

    List<String> keys = ReflectionUtil.getCollectionElementKeys(elements);

    assertEquals(List.of("alpha", "#1", "#2", "beta", "#4"), keys);
  }

  @Test
  void duplicateNamesFallBackToPosition() {
    List<Object> elements = Arrays.asList(named("dup"), named("dup"), named("solo"));

    List<String> keys = ReflectionUtil.getCollectionElementKeys(elements);

    assertEquals(List.of("#0", "#1", "solo"), keys);
  }

  @Test
  void allNullElementsGetPositionKeys() {
    List<Object> elements = Arrays.asList(null, null, null);

    List<String> keys = ReflectionUtil.getCollectionElementKeys(elements);

    assertEquals(List.of("#0", "#1", "#2"), keys);
  }

  private static NamedElement named(String name) {
    return new NamedElement(name);
  }

  public static final class NamedElement {
    private final String name;

    public NamedElement(String name) {
      this.name = name;
    }

    public String getName() {
      return name;
    }
  }
}
